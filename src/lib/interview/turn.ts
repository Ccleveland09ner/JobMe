/**
 * The turn pipeline: one answer in, one next question out.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > The Core Journey Through the System (8)
 *
 * Deliberately separate from the route handler so the same code path runs
 * under the HTTP route AND under the headless rehearsal harness. A rehearsal
 * that exercised different logic than production would prove nothing.
 *
 * Order matters and is load-bearing:
 *   1. pre-classifier (deterministic, no model call)
 *   2. evaluate + embed IN PARALLEL   <- the only reason a turn fits 1.5s
 *   3. band (with hysteresis against the previous answer in this thread)
 *   4. recompute the gap in code, overriding the model
 *   5. extract evidence locally, guaranteeing a verbatim substring
 *   6. step() — the engine, and the ONLY thing that picks the move
 *   7. resolve the next question's wording, validated, with a bank fallback
 */

import { classifyBand, computePrimaryGap } from "@/lib/engine/classify";
import { clarifySeeds, deepenSeeds, questionFor } from "@/lib/engine/bank";
import { commitQuestion, step, type StepInput } from "@/lib/engine/policy";
import {
  NUDGE_LINE,
  REPEAT_LINE,
  SCORING_FAILED_LINE,
  WRAP_LINE,
  reasonLine,
} from "@/lib/engine/notepad";
import type {
  Band,
  Dimension,
  EngineState,
  Move,
  Question,
  Scores,
} from "@/lib/engine/types";

import { EvalError, evaluateAndDraft, extractEvidence } from "@/lib/ai/evaluate";
import {
  chooseQuestionText,
  heuristicGap,
  heuristicScores,
  preClassify,
} from "@/lib/ai/questions";
import { generateResumeQuestion } from "@/lib/ai/resume-questions";
import type { RoleProfile } from "@/lib/jd/distill";
import { MIN_ANSWER_WORDS, fillerCount, wordCount, wpm } from "@/lib/stats";

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
  /** Resume text backing the next item, when a resume-led opening is due. */
  excerptFor?: (itemId: string) => Promise<string>;
  /**
   * Override the evaluator. Production leaves this unset; the rehearsal
   * harness supplies a scripted one so a 20-turn full-mode session can be
   * validated without spending 20 requests against a 15/minute free tier.
   *
   * Everything downstream — banding, hysteresis, the engine, question
   * selection, coverage — runs identically either way, which is the point.
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
      stats: { wpm: number; fillers: number };
      /** Persisted on the turn row; null means unscored. */
      persistedScores: Scores | null;
    };

export async function runTurn(ctx: TurnContext): Promise<TurnResult> {
  const { state, transcript } = ctx;

  // ---- 1. too short to score --------------------------------------------
  // Not a turn: no scoring, no cap increment, no turnSeq increment. Otherwise
  // a cough costs the candidate one of ten questions.
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

  const evaluate = ctx.evaluate ?? evaluateAndDraft;

  try {
    const evaluation = await evaluate({
      topic: state.currentQuestion.topic,
      questionText: state.currentQuestion.text,
      questionType: state.currentQuestion.type,
      answer: transcript,
      resumeFacts: ctx.resumeFacts,
      roleText: ctx.role?.title ?? null,
      difficulty: state.difficulty,
      priorThreadTurns: [],
      signal: AbortSignal.timeout(EVAL_TIMEOUT_MS),
    });
    scores = evaluation.scores;
    observation = evaluation.observation;
    modelOffTopic = evaluation.off_topic;
    repeatsPrevious = evaluation.repeats_previous;
    drafts = evaluation.drafts;
  } catch (err) {
    // The degraded path. This is simultaneously the latency fallback, the
    // quota fallback (free tier is 15 req/min), and a live demonstration that
    // the engine can run an interview with the model completely unavailable.
    degraded = true;
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
      // A follow-up: prefer the model's draft, fall back to a bank seed aimed
      // at the same gap. Either way the ENGINE chose which move this is.
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

  const captureMs = ctx.captureMs ?? ctx.holdMs;

  return {
    kind: "turn",
    state: nextState,
    move: result.move,
    next: nextQuestion,
    done: result.move === "wrap",
    wrapLine: result.move === "wrap" ? WRAP_LINE : undefined,
    persistedScores: degraded ? null : scores,
    stats: {
      wpm: wpm(transcript, captureMs),
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
