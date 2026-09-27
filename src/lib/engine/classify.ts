/**
 * Band classification. Pure, no I/O, unit-tested.
 *
 * Ref: docs/PRD-JobMe-MVP.md > Adaptive Engine (Bands)
 *
 * The band decides the next move, so everything here is deterministic: same
 * inputs, same band, every run. That is what makes "the scripted weak answer
 * always gets a Clarify" a guarantee rather than a hope.
 */

import {
  GAP_PRIORITY,
  bandingValues,
  type Band,
  type Dimension,
  type Scores,
} from "./types";

export interface AnchorSimilarity {
  simWeak: number;
  simStrong: number;
}

/** Below this average, the answer is weak. */
export const WEAK_CEILING = 2.0;
/** At or above this average, with no low dimension, the answer is great. */
export const GREAT_FLOOR = 3.5;
/** No banding dimension may be below this for `great`. */
export const GREAT_MIN_DIMENSION = 3;

/**
 * How far past a threshold a score must land before it may leave the band it
 * was in last turn.
 *
 * Measured motivation: the same borderline answer scored 2.00 on one run and
 * 1.55 on the next, flipping mediocre/weak. Both produce a Clarify so the move
 * was unaffected, but they differ in tone and in the resolution rule ("a weak
 * thread that stayed weak after one clarify resolves the topic"), so a flicker
 * can end a topic early for no reason the candidate can perceive.
 */
export const HYSTERESIS = 0.15;

/**
 * An `off_topic` claim only forces `weak` when the relevance score agrees.
 *
 * Without this gate one model boolean outranks eight scores. Observed live: a
 * genuinely strong answer averaging 3.60 was flagged off-topic and banded
 * `weak`, treating a strong candidate who mis-framed an answer identically to
 * one who said nothing.
 */
export const OFF_TOPIC_RELEVANCE_CEILING = 2;

export function average(scores: Scores): number {
  const values = bandingValues(scores);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function minimum(scores: Scores): number {
  return Math.min(...bandingValues(scores));
}

/** True when the model's off-topic claim is corroborated by relevance. */
export function isOffTopic(scores: Scores, modelSaysOffTopic: boolean): boolean {
  return (
    modelSaysOffTopic && scores.relevance <= OFF_TOPIC_RELEVANCE_CEILING
  );
}

export interface ClassifyOptions {
  /** The band of the previous answer in this thread, for hysteresis. */
  previousBand?: Band | null;
  anchor?: AnchorSimilarity;
  /**
   * The anchor downgrade runs on an uncalibrated 0.05 threshold over
   * embeddings that shift with any change to the exemplar bank or the
   * embedding model. Off by default: a false downgrade turns a Deepen into a
   * Clarify on stage.
   */
  anchorDowngradeEnabled?: boolean;
}

/** The band before hysteresis and the anchor check. */
function rawBand(avg: number, min: number, offTopic: boolean): Band {
  if (offTopic || avg < WEAK_CEILING) return "weak";
  if (avg >= GREAT_FLOOR && min >= GREAT_MIN_DIMENSION) return "great";
  return "mediocre";
}

/**
 * Keeps the previous band unless the new average clears the threshold by
 * `HYSTERESIS`. Only ever resists CHANGE — it can never invent a band that the
 * raw scores do not support by more than the margin.
 */
function applyHysteresis(raw: Band, previous: Band, avg: number): Band {
  if (raw === previous) return raw;

  if (previous === "mediocre" && raw === "weak") {
    return avg > WEAK_CEILING - HYSTERESIS ? "mediocre" : "weak";
  }
  if (previous === "mediocre" && raw === "great") {
    return avg < GREAT_FLOOR + HYSTERESIS ? "mediocre" : "great";
  }
  if (previous === "weak" && raw === "mediocre") {
    return avg < WEAK_CEILING + HYSTERESIS ? "weak" : "mediocre";
  }
  if (previous === "great" && raw === "mediocre") {
    return avg > GREAT_FLOOR - HYSTERESIS ? "great" : "mediocre";
  }
  // weak <-> great is never a borderline case; let it through.
  return raw;
}

export function classifyBand(
  scores: Scores,
  modelSaysOffTopic: boolean,
  options: ClassifyOptions = {},
): Band {
  const offTopic = isOffTopic(scores, modelSaysOffTopic);
  const avg = average(scores);
  const min = minimum(scores);

  let band = rawBand(avg, min, offTopic);

  // Off-topic is categorical, not borderline — never smooth it away.
  if (!offTopic && options.previousBand) {
    band = applyHysteresis(band, options.previousBand, avg);
  }

  if (
    options.anchorDowngradeEnabled &&
    band === "great" &&
    options.anchor &&
    options.anchor.simWeak - options.anchor.simStrong > 0.05
  ) {
    band = "mediocre";
  }

  return band;
}

/**
 * Lowest-scoring dimension across all eight, ties broken by GAP_PRIORITY.
 *
 * Recomputed in code and allowed to override the model, so the gap shown on
 * the notepad always matches the scores shown beside it.
 */
export function computePrimaryGap(scores: Scores): Dimension {
  let best: Dimension = GAP_PRIORITY[0];
  for (const dimension of GAP_PRIORITY) {
    if (scores[dimension] < scores[best]) best = dimension;
  }
  return best;
}

/**
 * True when a follow-up failed to lift anything: no dimension rose by >= 1
 * against the previous answer in the thread.
 *
 * This is what stops a topic grinding on after the candidate has given what
 * they have.
 */
export function noDimensionRose(previous: Scores, current: Scores): boolean {
  return GAP_PRIORITY.every((d) => current[d] - previous[d] < 1);
}
