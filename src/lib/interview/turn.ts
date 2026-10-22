/**
 * The turn pipeline: one answer in, one next question out, shared by the route
 * and the rehearsal harness. In order: pre-classify, evaluate (with a timeout),
 * band, gap and evidence in code, step() picks the move, then the wording.
 */

import { classifyBand, resolveGap } from "../engine/classify";
import { clarifySeeds, deepenSeeds, questionFor } from "../engine/bank";
import { commitQuestion, step, type NextQuestionSpec, type StepInput } from "../engine/policy";
import {
  NO_EXPERIENCE_LINE,
  NUDGE_LINE,
  REPEAT_LINE,
  SCORING_FAILED_LINE,
  WRAP_LINE,
  reasonLine,
  transitionLead,
} from "../engine/notepad";
import { TOPICS } from "../engine/topics";
import {
  isFollowUpType,
  progressOf,
  questionKind,
  type Band,
  type Dimension,
  type EngineState,
  type Move,
  type Question,
  type QuestionKind,
  type QuestionSource,
  type QuestionType,
  type Scores,
  type TopicId,
} from "../engine/types";

import { EvalError, evaluateAndDraft, extractEvidence } from "../ai/evaluate";
import { chooseQuestionText, heuristicScores, preClassify } from "../ai/questions";
import {
  fallbackResumeQuestion,
  type generateResumeQuestion,
} from "../ai/resume-questions";
import type { RoleProfile } from "../jd/profile";
import { formatFactsForPrompt, type ResumeFacts } from "../resume/facts";
import { jobForPrompt, parsePlan, plannedBankOpening, plannedResumeOpening } from "../plan";
import type { QuestionPlan, TurnBody } from "../schemas";
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
  topic: TopicId;
  questionType: QuestionType;
  source: QuestionSource;
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
  const evaluated = await evaluateAnswer(ctx, kind);
  const degraded = evaluated.degradedReason !== null;
  const { band, primaryGap } = judgeAnswer({
    transcript,
    questionType: current.type,
    kind,
    scores: evaluated.scores,
    modelOffTopic: evaluated.modelOffTopic,
    modelGap: evaluated.modelGap,
    previousBand: state.threadScores.length ? state.lastBand : null,
  });

  // The engine decides.
  const stepInput: StepInput = {
    scores: evaluated.scores,
    band,
    primaryGap,
    repeatsPrevious: evaluated.repeatsPrevious,
    noExperience: evaluated.noExperience,
  };
  const result = step(state, stepInput);

  let next: Question | null = null;
  let lead: string | undefined;
  let nextState = result.state;
  if (result.next) {
    ({ question: next, lead } = wordNext(result.next, nextState, ctx.plan, evaluated.drafts, primaryGap));
    nextState = commitQuestion(nextState, next);
  }

  // Over capture time only (hold time includes pauses); typed answers get no rate.
  const speakingRate =
    ctx.captureMs && ctx.captureMs > 0 ? wpm(transcript, ctx.captureMs) : null;

  return {
    kind: "turn",
    state: nextState,
    move: result.move,
    next,
    lead,
    done: result.move === "wrap",
    wrapLine: result.move === "wrap" ? WRAP_LINE : undefined,
    persistedScores: degraded ? null : evaluated.scores,
    degradedReason: evaluated.degradedReason,
    evalMs: evaluated.evalMs,
    stats: {
      wpm: speakingRate,
      fillers: fillerCount(transcript),
    },
    notepad: {
      seq: nextState.turnSeq,
      topic: current.topic,
      questionType: current.type,
      source: current.source,
      kind,
      scores: degraded ? null : evaluated.scores,
      band: degraded ? null : band,
      primaryGap: degraded ? null : primaryGap,
      evidence: extractEvidence(transcript),
      observation: evaluated.observation,
      reason: evaluated.repeatsPrevious
        ? REPEAT_LINE
        : evaluated.noExperience && result.move !== "wrap"
          ? NO_EXPERIENCE_LINE
          : reasonLine(result.move, primaryGap, band),
      degraded,
    },
  };
}

/** What the evaluator made of an answer, or the heuristics when it was unavailable. */
interface Evaluated {
  scores: Scores;
  observation: string;
  modelOffTopic: boolean;
  repeatsPrevious: boolean;
  noExperience: boolean;
  /** The gap the model's clarify draft was written against. */
  modelGap: string | null;
  drafts: { deepen: string; clarify: string } | null;
  /** Null when the model scored the answer. */
  degradedReason: DegradedReason | null;
  evalMs: number;
}

async function evaluateAnswer(ctx: TurnContext, kind: QuestionKind): Promise<Evaluated> {
  const { state, transcript } = ctx;
  const current = state.currentQuestion;

  /**
   * A follow-up adds to the ORIGINAL question. The evaluator scores the whole
   * answer so far against that question, so a reply that fills a gap
   * completes the answer rather than standing as a separate, narrower one.
   * Without the thread (a failed history read) it falls back to scoring the
   * reply on its own, against the follow-up.
   */
  const prior = ctx.priorThreadTurns ?? [];
  const followUp = isFollowUpType(current.type) && prior.length > 0;

  const evaluate = ctx.evaluate ?? evaluateAndDraft;
  const signal = AbortSignal.timeout(EVAL_TIMEOUT_MS);
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);

  try {
    const evaluation = await evaluate({
      kind,
      topic: TOPICS[current.topic]?.label ?? current.topic,
      questionText: followUp ? prior[0].question : current.text,
      questionType: current.type,
      answer: transcript,
      followUpQuestion: followUp ? current.text : null,
      resumeFacts: ctx.resumeFacts,
      roleText: ctx.roleText ?? ctx.role?.title ?? null,
      seniority: ctx.seniority ?? ctx.role?.seniority ?? null,
      priorThreadTurns: followUp ? prior : [],
      askedQuestions: state.askedQuestions,
      signal,
    });
    return {
      scores: evaluation.scores,
      observation: evaluation.observation,
      modelOffTopic: evaluation.off_topic,
      repeatsPrevious: evaluation.repeats_previous,
      noExperience: evaluation.status === "no_experience",
      modelGap: evaluation.clarify_gap,
      drafts: evaluation.drafts,
      degradedReason: null,
      evalMs: elapsed(),
    };
  } catch (err) {
    // Degraded: the engine runs on without the model (timeout or quota).
    const degradedReason = degradedReasonFor(err, signal);
    if (!(err instanceof EvalError)) {
      console.warn(`[turn] unexpected evaluator failure: ${String(err)}`);
    }
    return {
      scores: heuristicScores(transcript, kind),
      observation: SCORING_FAILED_LINE,
      modelOffTopic: false,
      repeatsPrevious: false,
      noExperience: false,
      modelGap: null,
      drafts: null,
      degradedReason,
      evalMs: elapsed(),
    };
  }
}

/**
 * The band and the gap to chase, decided in code. A short opening is weak
 * whatever the model says; otherwise the scores decide, with hysteresis
 * against the previous answer in the thread. The model's gap wins only when
 * the scores agree it is one (resolveGap), so the reason line describes the
 * question actually asked. Exported for the calibration scripts.
 */
export function judgeAnswer(input: {
  transcript: string;
  questionType: QuestionType;
  kind: QuestionKind;
  scores: Scores;
  modelOffTopic?: boolean;
  modelGap?: string | null;
  /** The band of the previous answer in this thread. */
  previousBand?: Band | null;
}): { band: Band; primaryGap: Dimension } {
  const band =
    preClassify(input.transcript, input.questionType) ??
    classifyBand(input.scores, input.kind, input.modelOffTopic ?? false, {
      previousBand: input.previousBand ?? null,
    });
  return { band, primaryGap: resolveGap(input.scores, input.kind, input.modelGap ?? null).gap };
}

/** The next question's wording: planned, drafted, or a bank seed. The engine already chose the move. */
function wordNext(
  spec: NextQuestionSpec,
  state: EngineState,
  plan: QuestionPlan | null | undefined,
  drafts: Evaluated["drafts"],
  primaryGap: Dimension,
): { question: Question; lead?: string } {
  const asked = state.askedQuestions;
  let text: string;
  let topic = spec.topic;

  if (spec.type === "opening" && spec.source === "resume" && spec.resumeItem) {
    // Prepared at session start; the fallback still names the item.
    const planned = plannedResumeOpening(plan, spec.resumeItem.id, asked);
    text = planned?.text ?? fallbackResumeQuestion(spec.resumeItem);
    // The competency the question actually lands on, so follow-up seeds match.
    topic = planned?.topic ?? spec.topic;
  } else if (spec.type === "opening") {
    text = plannedBankOpening(plan, spec.topic, spec.difficulty, asked) ?? questionFor(spec.topic, spec.difficulty);
  } else {
    // The draft, else a seed for the same gap; the engine chose the move.
    text = chooseQuestionText({
      draft: spec.type === "deepen" ? drafts?.deepen : drafts?.clarify,
      seeds: spec.type === "deepen" ? deepenSeeds(spec.topic) : clarifySeeds(spec.topic, spec.gap ?? primaryGap),
      askedQuestions: asked,
    }).text;
  }

  return {
    question: {
      text,
      type: spec.type,
      topic,
      difficulty: spec.difficulty,
      source: spec.source,
      resumeItemId: spec.resumeItem?.id,
    },
    // A new thread: mark the change of topic the way an interviewer would.
    lead: spec.type === "opening" ? transitionLead(spec.source, state.questionCount) : undefined,
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
  return {
    state: args.state,
    transcript: args.answer.transcript,
    holdMs: args.answer.holdMs,
    captureMs: args.answer.captureMs,
    // Distilled facts go in every prompt (a fixed prefix).
    resumeFacts: args.resume ? formatFactsForPrompt((args.resume.resume_facts ?? null) as ResumeFacts | null) : null,
    role: args.resume ? ((args.resume.role_profile ?? null) as RoleProfile | null) : null,
    roleText: jobForPrompt(plan, args.postingText),
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

// Answering a turn, with the route's storage passed in

/** The session columns a turn reads. */
export interface TurnSessionRow {
  engine_state: unknown;
  resume_id: string | null;
  status: string;
  role_text: string | null;
  question_plan: unknown;
}

export interface TurnStore {
  /** The session (null when missing, or not this user's) with its latest turns, or why it couldn't be read. */
  load(): Promise<{ session: TurnSessionRow | null; recentTurns: Parameters<typeof threadHistory>[1] } | { error: string }>;
  loadResume(id: string): Promise<{ resume_facts?: unknown; role_profile?: unknown } | null>;
  /** submit_turn: the turn and the new state in one transaction, only from the sequence read. */
  submit(state: EngineState, turn: Record<string, unknown>): Promise<{ code?: string; message: string } | null>;
  /** The state another submit left, after this one lost the race. */
  reloadState(): Promise<EngineState | null>;
}

export type AnswerOutcome =
  | { kind: "load-failed"; reason: string }
  | { kind: "not-found" }
  | { kind: "finished" }
  /** Not the next turn: the state to resync from. */
  | { kind: "stale"; state: EngineState }
  | { kind: "nudge"; line: string }
  | { kind: "save-failed"; reason: string; seq: number }
  | { kind: "saved"; result: Extract<TurnResult, { kind: "turn" }>; saveMs: number };

/** One answer, from the stored session to the saved turn. */
export async function submitAnswer(
  answer: TurnBody,
  store: TurnStore,
  deps: { runTurn?: typeof runTurn } = {},
): Promise<AnswerOutcome> {
  const loaded = await store.load();
  if ("error" in loaded) return { kind: "load-failed", reason: loaded.error };
  const { session, recentTurns } = loaded;
  if (!session) return { kind: "not-found" };
  if (session.status === "completed") return { kind: "finished" };

  const state = session.engine_state as EngineState;
  // Idempotency: a double-fired submit gets the state to resync from, not a second turn.
  if (answer.clientTurnSeq !== state.turnSeq + 1) return { kind: "stale", state };

  const resume = session.resume_id ? await store.loadResume(session.resume_id) : null;
  const ctx = turnContextFrom({
    state,
    answer,
    storedPlan: session.question_plan,
    postingText: session.role_text ?? null,
    resume,
    recentTurns,
  });
  const result = await (deps.runTurn ?? runTurn)(ctx);
  // Not persisted, not counted: a cough must not cost a question.
  if (result.kind === "nudge") return { kind: "nudge", line: result.line };

  const started = performance.now();
  const error = await store.submit(result.state, turnRowFor(ctx, result));
  const saveMs = Math.round(performance.now() - started);
  // Lost the race: the other submit counts, and the client resyncs.
  if (isStaleSubmit(error)) return { kind: "stale", state: (await store.reloadState()) ?? state };
  if (error) return { kind: "save-failed", reason: error.message, seq: result.state.turnSeq };
  return { kind: "saved", result, saveMs };
}
