/** Band classification: pure and deterministic, since the band decides the next move. */

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

/** How far past a threshold a score must land to leave last turn's band (no borderline flicker). */
export const HYSTERESIS = 0.15;

/** `off_topic` forces `weak` only when relevance agrees (one boolean mustn't outrank eight scores). */
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
  /** Uncalibrated, so off by default (a false downgrade turns a Deepen into a Clarify). */
  anchorDowngradeEnabled?: boolean;
}

/** The band before hysteresis and the anchor check. */
function rawBand(avg: number, min: number, offTopic: boolean): Band {
  if (offTopic || avg < WEAK_CEILING) return "weak";
  if (avg >= GREAT_FLOOR && min >= GREAT_MIN_DIMENSION) return "great";
  return "mediocre";
}

/** Resists change only; never invents a band the scores do not nearly support. */
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

/** The lowest of all eight (ties by GAP_PRIORITY), so the notepad's gap matches its scores. */
export function computePrimaryGap(scores: Scores): Dimension {
  let best: Dimension = GAP_PRIORITY[0];
  for (const dimension of GAP_PRIORITY) {
    if (scores[dimension] < scores[best]) best = dimension;
  }
  return best;
}

/** No dimension rose by 1 or more since the previous answer: the topic has plateaued. */
export function noDimensionRose(previous: Scores, current: Scores): boolean {
  return GAP_PRIORITY.every((d) => current[d] - previous[d] < 1);
}
