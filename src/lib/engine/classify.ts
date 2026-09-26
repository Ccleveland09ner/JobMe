/**
 * Band classification. Pure, no I/O, unit-tested.
 *
 * TODO(slice 2): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > Adaptive Engine > classify.ts
 *      docs/PRD-JobMe-MVP.md > Adaptive Engine (Bands)
 *
 * Order of checks matters:
 *   1. offTopic || avg < 2.0            -> weak
 *   2. avg >= 3.5 && min >= 3           -> great
 *   3. otherwise                        -> mediocre
 *   4. anchor downgrade: great but
 *      (simWeak - simStrong) > 0.05     -> mediocre  (conservative probe)
 */

import type { Band, Dimension, Scores } from "./types";

export interface AnchorSimilarity {
  simWeak: number;
  simStrong: number;
}

export function classifyBand(
  scores: Scores,
  offTopic: boolean,
  anchor?: AnchorSimilarity,
): Band {
  void scores;
  void offTopic;
  void anchor;
  throw new Error("TODO(slice 2): classifyBand not implemented");
}

/**
 * Lowest-scoring dimension, ties broken by GAP_PRIORITY. Overrides whatever
 * the model claimed, so the gap shown on the notepad is always deterministic.
 */
export function computePrimaryGap(scores: Scores): Dimension {
  void scores;
  throw new Error("TODO(slice 2): computePrimaryGap not implemented");
}

export function average(scores: Scores): number {
  void scores;
  throw new Error("TODO(slice 2): average not implemented");
}
