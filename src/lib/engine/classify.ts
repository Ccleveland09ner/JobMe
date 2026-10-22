/**
 * Band classification. Pure and deterministic — the band decides the next
 * move, which is what makes "the scripted weak answer always gets a Clarify" a
 * guarantee rather than a hope.
 *
 * Every function takes the question's KIND: a band is the kind's weighted
 * score (see WEIGHTS), and a gap is chosen only among the dimensions that
 * kind is scored on.
 *
 * Ref: PRD > Adaptive Engine (Bands); docs/Scoring-Rubric.md
 */

import {
  GAP_PRIORITY,
  NEVER_A_GAP,
  dimensionsFor,
  weightedScore,
  type Band,
  type Dimension,
  type QuestionKind,
  type Scores,
} from "./types";

export interface AnchorSimilarity {
  simWeak: number;
  simStrong: number;
}

/** Below this weighted score, the answer is weak. */
export const WEAK_CEILING = 2.0;
/** At or above this weighted score, with no low dimension, the answer is great. */
export const GREAT_FLOOR = 3.5;
/** No gating dimension may be below this for `great`. */
export const GREAT_MIN_DIMENSION = 3;

/** How far past a threshold a score must land to leave last turn's band (no borderline flicker). */
export const HYSTERESIS = 0.15;

/**
 * `off_topic` forces `weak` only when relevance agrees. Without this gate one
 * model boolean outranks every score — observed live, a 3.60-average answer
 * banded `weak` for mis-framing.
 */
export const OFF_TOPIC_RELEVANCE_CEILING = 2;

/** The kind's weighted score; 1 when nothing applicable was scored. */
export function average(scores: Scores, kind: QuestionKind): number {
  return weightedScore(scores, kind) ?? 1;
}

/**
 * The lowest score among the dimensions that gate `great`: everything the
 * kind is scored on except communication (see NEVER_A_GAP).
 */
export function minimum(scores: Scores, kind: QuestionKind): number {
  const values = dimensionsFor(kind)
    .filter((d) => !NEVER_A_GAP.has(d))
    .map((d) => scores[d])
    .filter((v): v is number => typeof v === "number");
  return values.length ? Math.min(...values) : 1;
}

/** True when the model's off-topic claim is corroborated by relevance. */
export function isOffTopic(scores: Scores, modelSaysOffTopic: boolean): boolean {
  return (
    modelSaysOffTopic &&
    (scores.relevance ?? 1) <= OFF_TOPIC_RELEVANCE_CEILING
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
  kind: QuestionKind,
  modelSaysOffTopic: boolean,
  options: ClassifyOptions = {},
): Band {
  const offTopic = isOffTopic(scores, modelSaysOffTopic);
  const avg = average(scores, kind);
  const min = minimum(scores, kind);

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

/** The dimensions a follow-up may chase for this kind, in priority order. */
export function gapCandidates(kind: QuestionKind): Dimension[] {
  const applicable = new Set(dimensionsFor(kind));
  return GAP_PRIORITY.filter((d) => applicable.has(d) && !NEVER_A_GAP.has(d));
}

/**
 * Lowest applicable dimension, ties broken by GAP_PRIORITY. Overrides the
 * model so the gap on the notepad always matches the scores beside it.
 */
export function computePrimaryGap(scores: Scores, kind: QuestionKind): Dimension {
  const candidates = gapCandidates(kind);
  let best: Dimension = candidates[0];
  for (const dimension of candidates) {
    if ((scores[dimension] ?? 1) < (scores[best] ?? 1)) best = dimension;
  }
  return best;
}

/**
 * The gap a clarify should chase. The model wrote its clarify draft against
 * the gap IT named, so that gap wins when it is a real one — an applicable
 * dimension scored below solid — and the notepad's reason line then describes
 * the question actually asked. Otherwise the code's gap, which the bank seeds
 * are then picked for.
 */
export function resolveGap(
  scores: Scores,
  kind: QuestionKind,
  modelGap: string | null | undefined,
): { gap: Dimension; fromModel: boolean } {
  const candidates: string[] = gapCandidates(kind);
  if (
    modelGap &&
    candidates.includes(modelGap) &&
    (scores[modelGap as Dimension] ?? GREAT_MIN_DIMENSION) < GREAT_MIN_DIMENSION
  ) {
    return { gap: modelGap as Dimension, fromModel: true };
  }
  return { gap: computePrimaryGap(scores, kind), fromModel: false };
}

/**
 * No dimension rose by >= 1 against the previous answer. Stops a topic
 * grinding on after the candidate has given what they have. Compares only the
 * dimensions both answers carry, so a rubric change mid-session cannot read
 * as progress or as a plateau.
 */
export function noDimensionRose(previous: Scores, current: Scores): boolean {
  return GAP_PRIORITY.every((d) => {
    const before = previous[d];
    const after = current[d];
    if (typeof before !== "number" || typeof after !== "number") return true;
    return after - before < 1;
  });
}
