/**
 * The turn pipeline: one answer in, one next question out, shared by the route
 * and the rehearsal harness. In order: pre-classify, evaluate (with a timeout),
 * band, gap and evidence in code, step() picks the move, then the wording.
 * Imports are relative: vitest has no path alias.
 */

import { classifyBand, computePrimaryGap } from "../engine/classify";
import { clarifySeeds, deepenSeeds, questionFor } from "../engine/bank";
import { commitQuestion, step, type StepInput } from "../engine/policy";
import {
  NUDGE_LINE,
  REPEAT_LINE,
  SCORING_FAILED_LINE,
  WRAP_LINE,
  reasonLine,
  transitionLead,
} from "../engine/notepad";
import type {
  Band,
  Dimension,
  EngineState,
  Move,
  Question,
  Scores,
} from "../engine/types";

import { EvalError, evaluateAndDraft, extractEvidence } from "../ai/evaluate";
import {
  chooseQuestionText,
  heuristicGap,
  heuristicScores,
  preClassify,
} from "../ai/questions";
import { plannedBankOpening, plannedResumeOpening } from "../ai/question-plan";
import {
  fallbackResumeQuestion,
  type generateResumeQuestion,
} from "../ai/resume-questions";
import type { RoleProfile } from "../jd/distill";
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
  /** Earlier answers in this thread, oldest first, to score a follow-up in context. */
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

  const forcedBand = preClassify(transcript);

  // Evaluate.
  let scores: Scores;
  let observation: string;
  let modelOffTopic = false;
  let repeatsPrevious = false;
  let drafts: { deepen: string; clarify: string } | null = null;
  let degraded = false;
  let degradedReason: DegradedReason | null = null;

  const evaluate = ctx.evaluate ?? evaluateAndDraft;
  const signal = AbortSignal.timeout(EVAL_TIMEOUT_MS);
  const evalStarted = performance.now();

  try {
    const evaluation = await evaluate({
      topic: state.currentQuestion.topic,
      questionText: state.currentQuestion.text,
      questionType: state.currentQuestion.type,
      answer: transcript,
      resumeFacts: ctx.resumeFacts,
      roleText: ctx.roleText ?? ctx.role?.title ?? null,
      difficulty: state.difficulty,
      priorThreadTurns: ctx.priorThreadTurns ?? [],
      signal,
    });
    scores = evaluation.scores;
    observation = evaluation.observation;
    modelOffTopic = evaluation.off_topic;
    repeatsPrevious = evaluation.repeats_previous;
    drafts = evaluation.drafts;
  } catch (err) {
    // Degraded: the engine runs on without the model (timeout or quota).
    degraded = true;
    degradedReason = degradedReasonFor(err, signal);
    scores = heuristicScores(transcript);
    observation = SCORING_FAILED_LINE;
    if (!(err instanceof EvalError)) {
      console.warn(`[turn] unexpected evaluator failure: ${String(err)}`);
    }
  }
  const evalMs = Math.round(performance.now() - evalStarted);

  // Band.
  const band =
    forcedBand ??
    classifyBand(scores, modelOffTopic, {
      previousBand: state.threadScores.length ? state.lastBand : null,
    });

  // Gap and evidence, computed in code.
  const primaryGap = degraded
    ? heuristicGap(scores)
    : computePrimaryGap(scores);
  const evidence = extractEvidence(transcript);

  // The engine decides.
  const stepInput: StepInput = { scores, band, primaryGap, repeatsPrevious };
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
      scores: degraded ? null : scores,
      band: degraded ? null : band,
      primaryGap: degraded ? null : primaryGap,
      evidence,
      observation,
      reason: repeatsPrevious
        ? REPEAT_LINE
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
