/**
 * The turn pipeline: one answer in, one next question out.
 *
 * Separate from the route handler so the HTTP path and the rehearsal harness
 * run identical code — a rehearsal exercising different logic proves nothing.
 *
 * The order is load-bearing:
 *   1. pre-classifier (deterministic, no model call)
 *   2. evaluate, aborting at EVAL_TIMEOUT_MS
 *   3. band, with hysteresis against this thread's previous answer
 *   4. gap recomputed in code, overriding the model
 *   5. evidence extracted locally, guaranteeing a verbatim substring
 *   6. step() — the engine, and the only thing that picks the move
 *   7. wording resolved, validated, with a bank fallback
 *
 * Ref: TechDesign > The Core Journey (8)
 *
 * Imports are relative, not `@/`: vitest has no path alias, and this is the
 * module the hot-path tests need to load.
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
import { generateResumeQuestion } from "../ai/resume-questions";
import type { RoleProfile } from "../jd/distill";
import { MIN_ANSWER_WORDS, fillerCount, wordCount, wpm } from "../stats";

/** Aborts a slow evaluation so the turn degrades instead of hanging. */
export const EVAL_TIMEOUT_MS = 2200;

export interface TurnContext {
  state: EngineState;
  transcript: string;
  holdMs: number;
  captureMs?: number;
  /** Distilled resume facts, injected into every turn prompt. */
  resumeFacts?: string | null;
  role?: RoleProfile | null;
  /**
   * The target job for the evaluator — the session's own job description.
   * Falls back to the resume's distilled role title when absent.
   */
  roleText?: string | null;
  /**
   * Earlier answers in THIS thread, oldest first (see `threadHistory`). A
   * follow-up is scored against the story so far, which the evaluator cannot
   * do without them — nor can its drafts build on what was already said.
   */
  priorThreadTurns?: { question: string; answer: string }[];
  /** Resume text backing the next item, when a resume-led opening is due. */
  excerptFor?: (itemId: string) => Promise<string>;
  /**
   * Test seam. The rehearsal harness scripts this so a 20-turn session costs
   * nothing against a 15/minute free tier; everything downstream is identical.
   */
  evaluate?: typeof evaluateAndDraft;
  /** Same seam for resume-led openings, which are a second model call. */
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

/**
 * Why the evaluator was unavailable. Persisted for diagnosis only — the
 * notepad shows the same neutral line whatever the cause.
 */
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
      wrapLine?: string;
      done: boolean;
      /** `wpm` is null when no capture time was sent (typed answers). */
      stats: { wpm: number | null; fillers: number };
      /** Persisted on the turn row; null means unscored. */
      persistedScores: Scores | null;
      degradedReason: DegradedReason | null;
    };

export async function runTurn(ctx: TurnContext): Promise<TurnResult> {
  const { state, transcript } = ctx;

  // ---- 1. too short to score --------------------------------------------
  // No scoring, no cap increment, no turnSeq. A cough must not cost a question.
  if (wordCount(transcript) < MIN_ANSWER_WORDS) {
    return { kind: "nudge", line: NUDGE_LINE, state };
  }

  const forcedBand = preClassify(transcript);

  // ---- 2. evaluate ------------------------------------------------------
  let scores: Scores;
  let observation: string;
  let modelOffTopic = false;
  let repeatsPrevious = false;
  let drafts: { deepen: string; clarify: string } | null = null;
  let degraded = false;
  let degradedReason: DegradedReason | null = null;

  const evaluate = ctx.evaluate ?? evaluateAndDraft;
  const signal = AbortSignal.timeout(EVAL_TIMEOUT_MS);

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
    // The degraded path: latency fallback, quota fallback, and a live proof
    // that the engine runs an interview with the model unavailable.
    degraded = true;
    degradedReason = degradedReasonFor(err, signal);
    scores = heuristicScores(transcript);
    observation = SCORING_FAILED_LINE;
    if (!(err instanceof EvalError)) {
      console.warn(`[turn] unexpected evaluator failure: ${String(err)}`);
    }
  }

  // ---- 3. band ----------------------------------------------------------
  const band =
    forcedBand ??
    classifyBand(scores, modelOffTopic, {
      previousBand: state.threadScores.length ? state.lastBand : null,
    });

  // ---- 4/5. gap and evidence, both computed in code ----------------------
  const primaryGap = degraded
    ? heuristicGap(scores)
    : computePrimaryGap(scores);
  const evidence = extractEvidence(transcript);

  // ---- 6. the engine decides -------------------------------------------
  const stepInput: StepInput = { scores, band, primaryGap, repeatsPrevious };
  const result = step(state, stepInput);

  // ---- 7. wording for the next question ---------------------------------
  let nextQuestion: Question | null = null;
  let nextState = result.state;

  if (result.next) {
    const spec = result.next;
    let text: string;

    if (spec.type === "opening" && spec.source === "resume" && spec.resumeItem) {
      const excerpt = ctx.excerptFor
        ? await ctx.excerptFor(spec.resumeItem.id)
        : spec.resumeItem.label;
      const generate = ctx.generateQuestion ?? generateResumeQuestion;
      const generated = await generate({
        item: spec.resumeItem,
        excerpt,
        role: ctx.role ?? null,
        askedQuestions: nextState.askedQuestions,
        fallbackTopic: spec.topic,
      });
      text = generated.text;
    } else if (spec.type === "opening") {
      text = questionFor(spec.topic, spec.difficulty);
    } else {
      // Prefer the draft, fall back to a seed for the same gap. Either way
      // the ENGINE chose the move.
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

    nextQuestion = {
      text,
      type: spec.type,
      topic: spec.topic,
      difficulty: spec.difficulty,
      source: spec.source,
      resumeItemId: spec.resumeItem?.id,
    };
    nextState = commitQuestion(nextState, nextQuestion);
  }

  // Over capture time only (brief §2.8). Hold time includes thinking pauses
  // and under-reports pace by 20-40%, so an answer without a capture time
  // (typed mode) gets no rate rather than a misleadingly slow one.
  const speakingRate =
    ctx.captureMs && ctx.captureMs > 0 ? wpm(transcript, ctx.captureMs) : null;

  return {
    kind: "turn",
    state: nextState,
    move: result.move,
    next: nextQuestion,
    done: result.move === "wrap",
    wrapLine: result.move === "wrap" ? WRAP_LINE : undefined,
    persistedScores: degraded ? null : scores,
    degradedReason,
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

// ---------------------------------------------------------------------------
// Persistence helpers — pure, so the route stays a thin shell
// ---------------------------------------------------------------------------

/**
 * This thread's earlier answers, oldest first, picked from the most recent
 * turn rows. `threadScores` holds one entry per answer already given in the
 * current thread, so those are exactly the last `threadScores.length` turns —
 * at most MAX_FOLLOW_UPS, which is all the route needs to fetch.
 */
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

/**
 * The `turns` row for an answered turn, keyed by column name — the shape
 * `submit_turn` expands with `jsonb_populate_record`. Describes the question
 * that was ANSWERED (`ctx.state.currentQuestion`), not the next one.
 */
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

/**
 * `submit_turn` refused because another submit of this same turn got there
 * first: PT409 from its turnSeq guard, or 23505 from unique(session_id, seq).
 */
export function isStaleSubmit(
  error: { code?: string } | null | undefined,
): boolean {
  return error?.code === "PT409" || error?.code === "23505";
}
