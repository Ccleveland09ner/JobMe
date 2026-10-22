/**
 * The turn pipeline: one answer in, one next question out, shared by the route
 * and the rehearsal harness. In order: pre-classify, evaluate (with a timeout),
 * band, gap and evidence in code, step() picks the move, then the wording.
 */

import { classifyBand, resolveGap } from "../engine/classify";
import { BANK, clarifySeeds, deepenSeeds, questionFor } from "../engine/bank";
import { commitQuestion, step, type StepInput } from "../engine/policy";
import {
  NO_EXPERIENCE_LINE,
  NUDGE_LINE,
  REPEAT_LINE,
  SCORING_FAILED_LINE,
  WRAP_LINE,
  reasonLine,
  transitionLead,
} from "../engine/notepad";
import {
  progressOf,
  questionKind,
  type Band,
  type Dimension,
  type EngineState,
  type Move,
  type Question,
  type QuestionKind,
  type Scores,
} from "../engine/types";

import { EvalError, evaluateAndDraft, extractEvidence } from "../ai/evaluate";
import {
  chooseQuestionText,
  heuristicGap,
  heuristicScores,
  preClassify,
} from "../ai/questions";
import {
  fallbackResumeQuestion,
  type generateResumeQuestion,
} from "../ai/resume-questions";
import type { RoleProfile } from "../jd/profile";
import { formatFactsForPrompt, type ResumeFacts } from "../resume/facts";
import { companyLineFor, parsePlan, plannedBankOpening, plannedResumeOpening, roleTextFor } from "../plan";
import type { QuestionPlan } from "../schemas";
import { MIN_ANSWER_WORDS, fillerCount, wordCount, wpm } from "../stats";

/**
 * Aborts a slow evaluation so the turn degrades instead of hanging. Measured
 * live at 1.2-2.0 s; set well clear of that tail, as a slow scored turn beats
 * a fast unscored one.
 */
export const EVAL_TIMEOUT_MS = 4000;

export interface TurnContext {
  state: EngineState;
  transcript: string;
  holdMs: number;
  captureMs?: number;
  /** Distilled resume facts, injected into every turn prompt. */
  resumeFacts?: string | null;
  role?: RoleProfile | null;
  /** The target job for the evaluator; falls back to the resume's role title. */
  roleText?: string | null;
  /** The candidate's level ("intern", "senior"…), which "solid" is judged against. */
  seniority?: string | null;
  /**
   * Earlier answers in this thread, oldest first. A follow-up adds to the
   * original question, so it is scored as the whole answer so far; `[0]` is
   * the original question and first answer.
   */
  priorThreadTurns?: { question: string; answer: string }[];
  /** Openings prepared at session start; absent means the fixed text. */
  plan?: QuestionPlan | null;
  /** Test seam: the rehearsal harness scripts the evaluator. */
  evaluate?: typeof evaluateAndDraft;
  /**
   * @deprecated Unused: openings are pre-generated in the question plan.
   * TODO(integration): drop once scripts/rehearse.ts stops passing it.
   */
  excerptFor?: (itemId: string) => Promise<string>;
  /** @deprecated As `excerptFor`. */
  generateQuestion?: typeof generateResumeQuestion;
}

export interface NotepadEntry {
  seq: number;
  topic: string;
  questionType: string;
  source: string;
  /** The rubric the answer was scored on. */
  kind: QuestionKind;
  scores: Scores | null;
  band: Band | null;
  primaryGap: Dimension | null;
  evidence: string | null;
  observation: string;
  reason: string;
  /** True when the evaluator was unavailable and heuristics stood in. */
  degraded: boolean;
}

/** Why the evaluator was unavailable; persisted for diagnosis only. */
export type DegradedReason = "timeout" | "rate_limited" | "unavailable";

export function degradedReasonFor(
  err: unknown,
  signal: AbortSignal,
): DegradedReason {
  if (signal.aborted) return "timeout";
  if (err instanceof EvalError && err.rateLimited) return "rate_limited";
  return "unavailable";
}

export type TurnResult =
  | { kind: "nudge"; line: string; state: EngineState }
  | {
      kind: "turn";
      state: EngineState;
      move: Move;
      notepad: NotepadEntry;
      next: Question | null;
      /** Spoken before `next.text` when it opens a new thread. */
      lead?: string;
      wrapLine?: string;
      done: boolean;
      /** `wpm` is null when no capture time was sent (typed answers). */
      stats: { wpm: number | null; fillers: number };
      /** Persisted on the turn row; null means unscored. */
      persistedScores: Scores | null;
      degradedReason: DegradedReason | null;
      /** How long the evaluator took, success or failure — telemetry only. */
      evalMs: number;
    };

export async function runTurn(ctx: TurnContext): Promise<TurnResult> {
  const { state, transcript } = ctx;

  // Too short to score: not counted (a cough mustn't cost a question).
  if (wordCount(transcript) < MIN_ANSWER_WORDS) {
    return { kind: "nudge", line: NUDGE_LINE, state };
  }

  const current = state.currentQuestion;
  const kind = questionKind(current);
  const forcedBand = preClassify(transcript, current.type);

  /**
   * A follow-up adds to the ORIGINAL question. The evaluator scores the whole
   * answer so far against that question, so a reply that fills a gap
   * completes the answer rather than standing as a separate, narrower one.
   * Without the thread (a failed history read) it falls back to scoring the
   * reply on its own, against the follow-up.
   */
  const prior = ctx.priorThreadTurns ?? [];
  const isFollowUp = current.type !== "opening" && prior.length > 0;

  // Evaluate.
  let scores: Scores;
  let observation: string;
  let modelOffTopic = false;
  let repeatsPrevious = false;
  let noExperience = false;
  let modelGap: string | null = null;
  let drafts: { deepen: string; clarify: string } | null = null;
  let degraded = false;
  let degradedReason: DegradedReason | null = null;

  const evaluate = ctx.evaluate ?? evaluateAndDraft;
  const signal = AbortSignal.timeout(EVAL_TIMEOUT_MS);
  const evalStarted = performance.now();

  try {
    const evaluation = await evaluate({
      kind,
      topic: BANK[current.topic]?.label ?? current.topic,
      questionText: isFollowUp ? prior[0].question : current.text,
      questionType: current.type,
      answer: transcript,
      followUpQuestion: isFollowUp ? current.text : null,
      resumeFacts: ctx.resumeFacts,
      roleText: ctx.roleText ?? ctx.role?.title ?? null,
      seniority: ctx.seniority ?? ctx.role?.seniority ?? null,
      priorThreadTurns: isFollowUp ? prior : [],
      askedQuestions: state.askedQuestions,
      signal,
    });
    scores = evaluation.scores;
    observation = evaluation.observation;
    modelOffTopic = evaluation.off_topic;
    repeatsPrevious = evaluation.repeats_previous;
    noExperience = evaluation.status === "no_experience";
    modelGap = evaluation.clarify_gap;
    drafts = evaluation.drafts;
  } catch (err) {
    // Degraded: the engine runs on without the model (timeout or quota).
    degraded = true;
    degradedReason = degradedReasonFor(err, signal);
    scores = heuristicScores(transcript, kind);
    observation = SCORING_FAILED_LINE;
    if (!(err instanceof EvalError)) {
      console.warn(`[turn] unexpected evaluator failure: ${String(err)}`);
    }
  }
  const evalMs = Math.round(performance.now() - evalStarted);

  // Band.
  const band =
    forcedBand ??
    classifyBand(scores, kind, modelOffTopic, {
      previousBand: state.threadScores.length ? state.lastBand : null,
    });

  // Gap and evidence, computed in code. resolveGap keeps the gap the model's
  // clarify draft targets only when the scores agree, so the reason line
  // describes the question actually asked.
  const primaryGap = degraded
    ? heuristicGap(scores, kind)
    : resolveGap(scores, kind, modelGap).gap;
  const evidence = extractEvidence(transcript);

  // The engine decides.
  const stepInput: StepInput = { scores, band, primaryGap, repeatsPrevious, noExperience };
  const result = step(state, stepInput);

  // Wording for the next question.
  let nextQuestion: Question | null = null;
  let nextState = result.state;
  let lead: string | undefined;

  if (result.next) {
    const spec = result.next;
    const asked = nextState.askedQuestions;
    let text: string;
    let topic = spec.topic;

    if (spec.type === "opening" && spec.source === "resume" && spec.resumeItem) {
      // Prepared at session start; the fallback still names the item.
      const planned = plannedResumeOpening(ctx.plan, spec.resumeItem.id, asked);
      text = planned?.text ?? fallbackResumeQuestion(spec.resumeItem);
      // The competency the question actually lands on, so follow-up seeds match.
      topic = planned?.topic ?? spec.topic;
    } else if (spec.type === "opening") {
      text =
        plannedBankOpening(ctx.plan, spec.topic, spec.difficulty, asked) ??
        questionFor(spec.topic, spec.difficulty);
    } else {
      // The draft, else a seed for the same gap; the engine chose the move.
      const chosen = chooseQuestionText({
        draft: spec.type === "deepen" ? drafts?.deepen : drafts?.clarify,
        seeds:
          spec.type === "deepen"
            ? deepenSeeds(spec.topic)
            : clarifySeeds(spec.topic, spec.gap ?? primaryGap),
        askedQuestions: nextState.askedQuestions,
      });
      text = chosen.text;
    }

    // A new thread: mark the change of topic the way an interviewer would.
    if (spec.type === "opening") {
      lead = transitionLead(spec.source, nextState.questionCount);
    }

    nextQuestion = {
      text,
      type: spec.type,
      topic,
      difficulty: spec.difficulty,
      source: spec.source,
      resumeItemId: spec.resumeItem?.id,
    };
    nextState = commitQuestion(nextState, nextQuestion);
  }

  // Over capture time only (hold time includes pauses); typed answers get no rate.
  const speakingRate =
    ctx.captureMs && ctx.captureMs > 0 ? wpm(transcript, ctx.captureMs) : null;

  return {
    kind: "turn",
    state: nextState,
    move: result.move,
    next: nextQuestion,
    lead,
    done: result.move === "wrap",
    wrapLine: result.move === "wrap" ? WRAP_LINE : undefined,
    persistedScores: degraded ? null : scores,
    degradedReason,
    evalMs,
    stats: {
      wpm: speakingRate,
      fillers: fillerCount(transcript),
    },
    notepad: {
      seq: nextState.turnSeq,
      topic: state.currentQuestion.topic,
      questionType: state.currentQuestion.type,
      source: state.currentQuestion.source,
      kind,
      scores: degraded ? null : scores,
      band: degraded ? null : band,
      primaryGap: degraded ? null : primaryGap,
      evidence,
      observation,
      reason: repeatsPrevious
        ? REPEAT_LINE
        : noExperience && result.move !== "wrap"
          ? NO_EXPERIENCE_LINE
          : reasonLine(result.move, primaryGap, band),
      degraded,
    },
  };
}

// Persistence helpers (pure, so the route stays a thin shell)

/** This thread's earlier answers, oldest first: the last threadScores.length turns. */
export function threadHistory(
  state: EngineState,
  recent: {
    seq: number;
    question_text: string | null;
    answer_transcript: string | null;
  }[],
): { question: string; answer: string }[] {
  const firstInThread = state.turnSeq - state.threadScores.length + 1;
  return recent
    .filter((t) => t.seq >= firstInThread && t.seq <= state.turnSeq)
    .sort((a, b) => a.seq - b.seq)
    .map((t) => ({
      question: t.question_text ?? "",
      answer: t.answer_transcript ?? "",
    }));
}

/** The turns row for the answered question, keyed by column (for submit_turn). */
export function turnRowFor(
  ctx: TurnContext,
  result: Extract<TurnResult, { kind: "turn" }>,
): Record<string, unknown> {
  const asked = ctx.state.currentQuestion;
  return {
    topic: result.notepad.topic,
    question_type: result.notepad.questionType,
    difficulty: ctx.state.difficulty,
    question_text: asked.text,
    answer_transcript: ctx.transcript,
    scores: result.persistedScores,
    band: result.notepad.band,
    primary_gap: result.notepad.primaryGap,
    evidence: result.notepad.evidence,
    notepad_text: result.notepad.observation,
    reason_text: result.notepad.reason,
    wpm: result.stats.wpm,
    filler_count: result.stats.fillers,
    hold_ms: ctx.holdMs,
    capture_ms: ctx.captureMs ?? null,
    degraded_reason: result.degradedReason,
    question_source: asked.source,
    resume_item_id: asked.resumeItemId ?? null,
  };
}

/** submit_turn lost to another submit of the same turn (PT409 or 23505). */
export function isStaleSubmit(
  error: { code?: string } | null | undefined,
): boolean {
  return error?.code === "PT409" || error?.code === "23505";
}

/**
 * Everything runTurn needs, from the stored session, its resume (null without
 * one) and its latest turns. The stored plan is parsed, not trusted: a
 * malformed one means the fixed openings, not a 500. This session's job
 * outranks the resume's, the plan's summary beats the raw posting, and every
 * plan written since 2026-10 carries the job even when the model failed.
 */
export function turnContextFrom(args: {
  state: EngineState;
  answer: { transcript: string; holdMs: number; captureMs?: number };
  storedPlan: unknown;
  /** The session's posting text, `role_text`. */
  postingText: string | null;
  resume: { resume_facts?: unknown; role_profile?: unknown } | null;
  recentTurns: Parameters<typeof threadHistory>[1];
}): TurnContext {
  const plan = parsePlan(args.storedPlan);
  const roleLines = [roleTextFor(plan, args.postingText), companyLineFor(plan)].filter(Boolean);
  return {
    state: args.state,
    transcript: args.answer.transcript,
    holdMs: args.answer.holdMs,
    captureMs: args.answer.captureMs,
    // Distilled facts go in every prompt (a fixed prefix).
    resumeFacts: args.resume ? formatFactsForPrompt((args.resume.resume_facts ?? null) as ResumeFacts | null) : null,
    role: args.resume ? ((args.resume.role_profile ?? null) as RoleProfile | null) : null,
    roleText: roleLines.length ? roleLines.join("\n") : null,
    seniority: plan?.job?.seniority ?? (plan?.role?.seniority || null),
    priorThreadTurns: threadHistory(args.state, args.recentTurns),
    plan,
  };
}

/** The answer to an answered turn: the note, what comes next, and progress. */
export function turnResponseBody(result: Extract<TurnResult, { kind: "turn" }>) {
  const { state } = result;
  return {
    kind: "turn" as const,
    move: result.move,
    notepad: result.notepad,
    // `lead` (a new thread only) is spoken before `text`, never shown alone.
    next: result.next ? { ...result.next, lead: result.lead } : null,
    done: result.done,
    wrapLine: result.wrapLine,
    progress: progressOf(state),
  };
}

/** The 409 for a submit that isn't the next turn: the state to resync from. */
export function staleTurnBody(state: EngineState, received: number) {
  return { error: "Stale turn sequence", expected: state.turnSeq + 1, received, state };
}
