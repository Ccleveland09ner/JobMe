/**
 * The single LLM call per turn: score the answer AND draft both possible
 * follow-ups, so the deterministic policy can pick a move without a second
 * round trip.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > Evaluator
 *
 * THE INVARIANT: this module returns scores and candidate wording. It must
 * never return a move. `RawEvaluation` gaining a field named `move`, `action`
 * or `next_question` is the one change that breaks the architecture, and it is
 * reviewable in five seconds.
 *
 * Two fields the tech design asked the model for are computed in code instead:
 *
 *   primary_gap — `computePrimaryGap()` already overrode whatever the model
 *     said, so asking for it was paying decode tokens for a discarded value.
 *
 *   evidence — models paraphrase instead of quoting, so a verbatim check was
 *     needed anyway. Extracting it locally guarantees the scorecard's
 *     highlight matches the transcript, removes a hallucination class, and
 *     stops round-tripping the candidate's exact words through the model.
 *
 * Decode dominates this call's latency, so both removals are also speedups.
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

/** Raw model output. Deliberately small — see the note above. */
export interface RawEvaluation {
  scores: Scores;
  observation: string;
  off_topic: boolean;
  /**
   * Only meaningful on a follow-up: the candidate restated the earlier answer
   * instead of expanding it. A follow-up is supposed to ADD, so a repeat is a
   * distinct failure from a merely weak answer and deserves different copy.
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
 * Picks the most quotable sentence from the answer.
 *
 * Scored by evidence density — numbers and first-person ownership language are
 * what the rubric actually cares about — with a length preference so the quote
 * is a sentence rather than a fragment. The result is guaranteed to be a
 * verbatim substring, which is what makes the scorecard highlight reliable.
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
  // Truncating must not break the verbatim guarantee, so cut on a word
  // boundary and keep the prefix — still an exact substring of the answer.
  return words.length <= maxWords ? best : words.slice(0, maxWords).join(" ");
}

/**
 * One call. Retries once on a validation failure, because a malformed payload
 * is usually a transient sampling artefact — but NOT on a rate limit, where
 * retrying immediately just burns the next request in a 15/minute budget.
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
