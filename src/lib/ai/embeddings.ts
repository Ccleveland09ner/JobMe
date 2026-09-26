/**
 * Embedding cross-checks. Runs in parallel with the evaluator call, so it adds
 * roughly zero latency to a turn.
 *
 * TODO(slice 7): implement. Slice 2 can ship on the LLM relevance score alone.
 * Ref: docs/TechDesign-JobMe-MVP.md > Embedding Checks
 *
 * Two uses:
 *  1. Relevance signal - cosine(answer, current question).
 *     Final Relevance = round((llmRelevance + simToScore(sim)) / 2)
 *  2. Anchor check - cosine against this topic's weak and strong exemplars,
 *     feeding the conservative downgrade in classifyBand().
 *
 * Bank vectors are PRECOMPUTED into data/bank-embeddings.json by
 * scripts/embed-bank.ts and committed, so Vercel never makes a cold-start call.
 */

import type { AnchorSimilarity } from "../engine/classify";

export function cosine(a: number[], b: number[]): number {
  void a;
  void b;
  throw new Error("TODO(slice 7): cosine not implemented");
}

/**
 * Similarity -> 1-4 score. CALIBRATE THESE IN HOUR 1 against the bank
 * exemplars; the thresholds below are a starting guess, not a result.
 */
export function simToScore(sim: number): number {
  void sim;
  throw new Error("TODO(slice 7): simToScore not implemented");
}

export const SIM_THRESHOLDS = { s2: 0.55, s3: 0.65, s4: 0.75 };

export function anchorCheck(
  answerVec: number[],
  topic: string,
): AnchorSimilarity {
  void answerVec;
  void topic;
  throw new Error("TODO(slice 7): anchorCheck not implemented");
}

/** P1: skip a next topic whose opening is cosine > 0.85 to any prior answer. */
export const REPEAT_THRESHOLD = 0.85;
