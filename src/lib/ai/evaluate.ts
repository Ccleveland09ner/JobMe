/**
 * The single LLM call per turn: score the answer AND draft both possible
 * follow-ups, so the deterministic policy can pick a move without a second
 * round trip.
 *
 * TODO(slice 2): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > Evaluator
 *      Latency target: p50 <= 1.5s (scripts/latency-probe.ts, hour 1)
 *
 * Zod-validate the output. On a validation failure, retry once; if that also
 * fails, throw EvalError and let the turn route fall back to a seed Clarify
 * with the turn saved as unscored.
 */

import type { Dimension, Scores } from "../engine/types";

export class EvalError extends Error {
  constructor(message = "Evaluation failed") {
    super(message);
    this.name = "EvalError";
  }
}

/** Raw model output, before the code-side corrections are applied. */
export interface RawEvaluation {
  scores: Scores;
  primary_gap: Dimension;
  evidence: string;
  observation: string;
  off_topic: boolean;
  drafts: { deepen: string; clarify: string };
}

export async function evaluateAndDraft(args: {
  topic: string;
  questionText: string;
  questionType: string;
  answer: string;
  roleText?: string | null;
  difficulty: number;
  priorThreadTurns: { question: string; answer: string }[];
}): Promise<RawEvaluation> {
  void args;
  throw new Error("TODO(slice 2): evaluateAndDraft not implemented");
}
