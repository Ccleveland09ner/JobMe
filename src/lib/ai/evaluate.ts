/**
 * One LLM call per turn: score the answer AND draft both follow-ups, so the
 * policy picks a move without a second round trip.
 *
 * THE INVARIANT: this returns scores and wording, never a move. `RawEvaluation`
 * gaining `move`, `action` or `next_question` is the one change that breaks
 * the architecture — reviewable in five seconds. `status` and `clarify_gap`
 * are judgements the engine MAY act on; it still decides the move itself.
 *
 * `primary_gap` and `evidence` are computed in code instead of asked for:
 * the gap is checked against the scores by `resolveGap()`, and models
 * paraphrase rather than quote, so extracting evidence locally guarantees the
 * scorecard highlight matches. Decode dominates latency, so both are speedups.
 *
 * Ref: TechDesign > Evaluator; docs/Scoring-Rubric.md
 */

import { Type } from "@google/genai";

import { LlmError, generateJson } from "./llm";
import { buildTurnPrompt, evaluatorSystemFor, OBSERVATION_MAX_CHARS, type TurnPromptArgs } from "./prompts";

import { gapCandidates } from "../engine/classify";
import { dimensionsFor } from "../engine/types";
import type { QuestionKind, QuestionType, Scores } from "../engine/types";

export class EvalError extends Error {
  constructor(
    message = "Evaluation failed",
    public readonly rateLimited = false,
  ) {
    super(message);
    this.name = "EvalError";
  }
}

/** What the evaluator concluded about the answer as a whole. */
export type AnswerStatus =
  | "complete"
  | "incomplete"
  | "incorrect"
  | "off_topic"
  | "no_experience";

export const ANSWER_STATUSES: readonly AnswerStatus[] = [
  "complete",
  "incomplete",
  "incorrect",
  "off_topic",
  "no_experience",
] as const;

/** Raw model output. Deliberately small — see above. */
export interface RawEvaluation {
  /** Exactly the dimensions the question's kind is scored on. */
  scores: Scores;
  status: AnswerStatus;
  observation: string;
  /** Derived from `status`, kept for the off-topic gate in classify.ts. */
  off_topic: boolean;
  /** Follow-ups only: restated the earlier answer instead of expanding it. */
  repeats_previous: boolean;
  /** The gap `drafts.clarify` was written against; checked by `resolveGap()`. */
  clarify_gap: string | null;
  drafts: { deepen: string; clarify: string };
}

const SCORE = { type: Type.INTEGER, minimum: 1, maximum: 4 } as const;

/**
 * Flat: the supported JSON Schema subset rejects $ref/oneOf/allOf. Built per
 * kind, so the model is only ever asked for the dimensions that kind uses.
 */
export function evalSchemaFor(kind: QuestionKind) {
  const dims = dimensionsFor(kind);
  return {
    type: Type.OBJECT,
    properties: {
      scores: {
        type: Type.OBJECT,
        properties: Object.fromEntries(dims.map((d) => [d, SCORE])),
        required: [...dims],
      },
      status: { type: Type.STRING, enum: [...ANSWER_STATUSES] },
      observation: { type: Type.STRING },
      clarify_gap: { type: Type.STRING, enum: gapCandidates(kind) },
      repeats_previous: { type: Type.BOOLEAN },
      drafts: {
        type: Type.OBJECT,
        properties: {
          deepen: { type: Type.STRING },
          clarify: { type: Type.STRING },
        },
        required: ["deepen", "clarify"],
      },
    },
    required: [
      "scores",
      "status",
      "observation",
      "clarify_gap",
      "repeats_previous",
      "drafts",
    ],
  } as const;
}

/** Rejects a malformed payload before it can reach the engine. */
export function validateEvaluation(
  value: unknown,
  kind: QuestionKind,
): RawEvaluation {
  const v = value as
    | (Partial<RawEvaluation> & { status?: unknown; off_topic?: unknown })
    | null;
  if (!v || typeof v !== "object") throw new EvalError("Not an object.");

  const raw = v.scores as Record<string, unknown> | undefined;
  if (!raw) throw new EvalError("Missing scores.");

  // Only the kind's dimensions are kept: a stray key the model added must not
  // reach a weighted score or the notepad.
  const scores: Scores = {};
  for (const d of dimensionsFor(kind)) {
    const s = raw[d];
    if (!Number.isInteger(s) || (s as number) < 1 || (s as number) > 4) {
      throw new EvalError(`Score ${d} is not an integer 1-4: ${String(s)}`);
    }
    scores[d] = s as number;
  }

  if (!v.drafts?.deepen || !v.drafts?.clarify) {
    throw new EvalError("Missing one or both drafts.");
  }

  // An unknown status degrades to "complete" rather than failing the turn:
  // it is advisory, and the scores still stand on their own.
  const status = ANSWER_STATUSES.includes(v.status as AnswerStatus)
    ? (v.status as AnswerStatus)
    : v.off_topic === true
      ? "off_topic"
      : "complete";

  const gap = typeof v.clarify_gap === "string" ? v.clarify_gap : null;

  return {
    scores,
    status,
    observation: String(v.observation ?? "").slice(0, OBSERVATION_MAX_CHARS),
    off_topic: status === "off_topic",
    repeats_previous: Boolean(v.repeats_previous),
    clarify_gap: gap && (gapCandidates(kind) as string[]).includes(gap) ? gap : null,
    drafts: {
      deepen: String(v.drafts.deepen),
      clarify: String(v.drafts.clarify),
    },
  };
}

/**
 * The most quotable sentence, scored by evidence density — numbers and
 * first-person language. Guaranteed to be a verbatim substring, which is what
 * makes the scorecard highlight work.
 */
export function extractEvidence(answer: string, maxWords = 20): string {
  const sentences = answer
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 4);

  if (!sentences.length) {
    return answer.split(/\s+/).slice(0, maxWords).join(" ");
  }

  const score = (s: string) => {
    const digits = (s.match(/\d/g) ?? []).length;
    const firstPerson = (s.match(/\b(I|my|me)\b/g) ?? []).length;
    const hedging = (s.match(/\b(we|our|the team)\b/gi) ?? []).length;
    return digits * 2 + firstPerson * 3 - hedging + Math.min(s.length / 40, 3);
  };

  const best = sentences.reduce((a, b) => (score(b) > score(a) ? b : a));
  const words = best.split(/\s+/);
  // Cut on a word boundary: the prefix is still an exact substring.
  return words.length <= maxWords ? best : words.slice(0, maxWords).join(" ");
}

/** Retries once on a validation failure, never on a rate limit. */
export async function evaluateAndDraft(
  args: TurnPromptArgs & { questionType: QuestionType; signal?: AbortSignal },
  generate: typeof generateJson = generateJson,
): Promise<RawEvaluation> {
  // Told "the answer below is everything said to the original question" only
  // when it is: without the thread, the reply is scored on its own.
  const asFollowUp = Boolean(args.followUpQuestion && args.priorThreadTurns?.length);
  const prompt = buildTurnPrompt(args);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { value } = await generate<unknown>({
        systemInstruction: evaluatorSystemFor(args.kind, asFollowUp ? args.questionType : "opening"),
        prompt,
        responseSchema: evalSchemaFor(args.kind),
        // Was 0.2. Calibration measured the same answer scoring 3.15 on one
        // run and 3.80 on the next; a score must not depend on the draw.
        temperature: 0,
        signal: args.signal,
      });
      return validateEvaluation(value, args.kind);
    } catch (err) {
      lastError = err as Error;
      if (err instanceof LlmError && err.rateLimited) {
        throw new EvalError(err.message, true);
      }
      if (args.signal?.aborted) break;
    }
  }

  throw new EvalError(
    `Evaluation failed after 2 attempts: ${lastError?.message ?? "unknown"}`,
  );
}
