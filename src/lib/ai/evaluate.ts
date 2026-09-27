/**
 * One LLM call per turn: score the answer AND draft both follow-ups, so the
 * policy picks a move without a second round trip.
 *
 * THE INVARIANT: this returns scores and wording, never a move. `RawEvaluation`
 * gaining `move`, `action` or `next_question` is the one change that breaks
 * the architecture — reviewable in five seconds.
 *
 * `primary_gap` and `evidence` are computed in code instead of asked for:
 * the gap was already overridden by `computePrimaryGap()`, and models
 * paraphrase rather than quote, so extracting evidence locally guarantees the
 * scorecard highlight matches. Decode dominates latency, so both are speedups.
 *
 * Ref: TechDesign > Evaluator
 */

import { Type } from "@google/genai";

import { LlmError, generateJson } from "./llm";
import { buildTurnPrompt, evaluatorSystemFor } from "./prompts";

import { DIMENSIONS } from "../engine/types";
import type { Scores } from "../engine/types";

export class EvalError extends Error {
  constructor(
    message = "Evaluation failed",
    public readonly rateLimited = false,
  ) {
    super(message);
    this.name = "EvalError";
  }
}

/** Raw model output. Deliberately small — see above. */
export interface RawEvaluation {
  scores: Scores;
  observation: string;
  off_topic: boolean;
  /**
   * Follow-ups only: restated the earlier answer instead of expanding it. A
   * distinct failure from a weak answer, and it gets different copy.
   */
  repeats_previous: boolean;
  drafts: { deepen: string; clarify: string };
}

const SCORE = { type: Type.INTEGER, minimum: 1, maximum: 4 } as const;

/** Flat: the supported JSON Schema subset rejects $ref/oneOf/allOf. */
const EVAL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    scores: {
      type: Type.OBJECT,
      properties: {
        situation: SCORE,
        task: SCORE,
        action: SCORE,
        result: SCORE,
        specificity: SCORE,
        impact: SCORE,
        ownership: SCORE,
        relevance: SCORE,
      },
      required: [...DIMENSIONS],
    },
    observation: { type: Type.STRING },
    off_topic: { type: Type.BOOLEAN },
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
    "observation",
    "off_topic",
    "repeats_previous",
    "drafts",
  ],
} as const;

/** Rejects a malformed payload before it can reach the engine. */
export function validateEvaluation(value: unknown): RawEvaluation {
  const v = value as Partial<RawEvaluation> | null;
  if (!v || typeof v !== "object") throw new EvalError("Not an object.");

  const scores = v.scores as Record<string, unknown> | undefined;
  if (!scores) throw new EvalError("Missing scores.");

  for (const d of DIMENSIONS) {
    const s = scores[d];
    if (!Number.isInteger(s) || (s as number) < 1 || (s as number) > 4) {
      throw new EvalError(`Score ${d} is not an integer 1-4: ${String(s)}`);
    }
  }

  if (!v.drafts?.deepen || !v.drafts?.clarify) {
    throw new EvalError("Missing one or both drafts.");
  }

  return {
    scores: v.scores as Scores,
    observation: String(v.observation ?? "").slice(0, 90),
    off_topic: Boolean(v.off_topic),
    repeats_previous: Boolean(v.repeats_previous),
    drafts: {
      deepen: String(v.drafts.deepen),
      clarify: String(v.drafts.clarify),
    },
  };
}

/**
 * The most quotable sentence, scored by evidence density — numbers and
 * first-person language, which is what the rubric cares about. Guaranteed to
 * be a verbatim substring, which is what makes the scorecard highlight work.
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

/**
 * Retries once on a validation failure (usually a transient sampling artefact)
 * but never on a rate limit, where retrying burns the next of 15 per minute.
 */
export async function evaluateAndDraft(args: {
  topic: string;
  questionText: string;
  questionType: string;
  answer: string;
  roleText?: string | null;
  resumeFacts?: string | null;
  difficulty: number;
  priorThreadTurns?: { question: string; answer: string }[];
  signal?: AbortSignal;
}): Promise<RawEvaluation> {
  const prompt = buildTurnPrompt({
    topic: args.topic,
    questionText: args.questionText,
    answer: args.answer,
    roleText: args.roleText,
    resumeFacts: args.resumeFacts,
    priorThreadTurns: args.priorThreadTurns,
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { value } = await generateJson<unknown>({
        systemInstruction: evaluatorSystemFor(args.questionType),
        prompt,
        responseSchema: EVAL_SCHEMA,
        temperature: 0.2,
        signal: args.signal,
      });
      return validateEvaluation(value);
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
