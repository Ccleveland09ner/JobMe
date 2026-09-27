/**
 * The gate between model-drafted wording and the candidate.
 *
 * Ref: docs/PRD-JobMe-MVP.md > Adaptive Engine
 *
 * The engine decides the MOVE. This module decides whether the model's wording
 * for that move is usable, and substitutes a bank seed when it is not. Nothing
 * here may change which move happens — that would move flow control into the
 * AI and break the guarantee that a scripted weak answer always gets a
 * Clarify.
 */

import type { Band, Dimension, Scores } from "../engine/types";

/** Drafts longer than this stop sounding like a spoken question. */
export const MAX_DRAFT_WORDS = 25;

export type DraftRejection =
  | "empty"
  | "too_long"
  | "not_a_question"
  | "multi_question"
  | "placeholder_leak"
  | "repeat";

export interface DraftCheck {
  ok: boolean;
  reason?: DraftRejection;
}

/**
 * Mechanical checks only — never a judgement about quality, which would be
 * another model call on the critical path.
 */
export function checkDraft(draft: string, askedQuestions: string[] = []): DraftCheck {
  const text = draft.trim();

  if (!text) return { ok: false, reason: "empty" };

  if (text.split(/\s+/).length > MAX_DRAFT_WORDS) {
    return { ok: false, reason: "too_long" };
  }

  if (!text.endsWith("?")) return { ok: false, reason: "not_a_question" };

  // Two questions in one turn gives the candidate a choice about what to
  // answer, which is exactly the gap-dodging the follow-up exists to close.
  if ((text.match(/\?/g) ?? []).length > 1) {
    return { ok: false, reason: "multi_question" };
  }

  // A redaction placeholder reaching the candidate would be jarring and would
  // also reveal that we rewrote their resume.
  if (/\[(CANDIDATE|EMAIL|PHONE|ADDRESS|LINK|metric|timeframe)\]/i.test(text)) {
    return { ok: false, reason: "placeholder_leak" };
  }

  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  if (askedQuestions.some((q) => normalise(q) === normalise(text))) {
    return { ok: false, reason: "repeat" };
  }

  return { ok: true };
}

/** Uses the draft when it passes, otherwise the deterministic bank seed. */
export function chooseQuestionText(args: {
  draft: string | undefined;
  seeds: string[] | undefined;
  askedQuestions?: string[];
}): { text: string; source: "draft" | "seed"; rejected?: DraftRejection } {
  const asked = args.askedQuestions ?? [];

  if (args.draft) {
    const check = checkDraft(args.draft, asked);
    if (check.ok) return { text: args.draft.trim(), source: "draft" };

    const seed = pickSeed(args.seeds, asked);
    if (seed) return { text: seed, source: "seed", rejected: check.reason };

    // No seed available: a flawed question beats no question, since silence
    // ends the interview. Repairs are cosmetic and preserve the wording.
    return {
      text: repairDraft(args.draft),
      source: "draft",
      rejected: check.reason,
    };
  }

  const seed = pickSeed(args.seeds, asked);
  if (seed) return { text: seed, source: "seed", rejected: "empty" };

  throw new Error("No draft and no seed available for this move.");
}

function pickSeed(seeds: string[] | undefined, asked: string[]): string | null {
  if (!seeds?.length) return null;
  const unused = seeds.find((s) => !asked.includes(s));
  return unused ?? seeds[0];
}

/** Minimal cosmetic repair — never changes what is being asked. */
export function repairDraft(draft: string): string {
  let text = draft.trim().replace(/\s+/g, " ");
  const words = text.split(" ");
  if (words.length > MAX_DRAFT_WORDS) {
    text = words.slice(0, MAX_DRAFT_WORDS).join(" ").replace(/[,;:]$/, "");
  }
  if (!text.endsWith("?")) text = text.replace(/[.!]*$/, "") + "?";
  return text;
}

/**
 * Deterministic pre-classifier. Runs BEFORE the model is consulted.
 *
 * This is the demo's insurance policy. `relevance` is blended from a float and
 * fed into `avg >= 3.5 && min >= 3`, so a one-point swing flips the band and
 * therefore the move. An answer this thin cannot be strong under any rubric,
 * so deciding it in code removes the model's vote entirely and makes
 * "scripted weak answer always gets a Clarify" true rather than likely.
 */
export const MIN_SUBSTANTIVE_WORDS = 25;

export function preClassify(answer: string): Band | null {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  if (words.length < MIN_SUBSTANTIVE_WORDS) return "weak";

  const hasNumber = /\d/.test(answer);
  // A concrete noun proxy: a capitalised word that is not sentence-initial.
  const hasProperNoun = /(?:\w[.!?]\s+|\s)[A-Z][a-z]{2,}/.test(answer);
  if (!hasNumber && !hasProperNoun) return "weak";

  return null;
}

/**
 * Heuristic scores for the degraded turn, when the evaluator is unavailable.
 *
 * Crude on purpose — the point is that an interview continues through a 429 or
 * a timeout, not that these numbers are good. The turn is persisted with
 * `scores: null` so these never pollute an average or a trend line.
 */
export function heuristicScores(answer: string): Scores {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const clamp = (n: number) => Math.max(1, Math.min(4, n)) as number;

  const length = words < 25 ? 1 : words < 60 ? 2 : words < 140 ? 3 : 4;
  const impact = /\d/.test(answer) ? 3 : 1;
  const ownership = /\b(I|my)\b/.test(answer)
    ? /\b(we|our)\b/i.test(answer)
      ? 2
      : 3
    : 1;
  const structure = /\b(then|after|because|so that|as a result|finally)\b/i.test(
    answer,
  )
    ? 3
    : 2;

  return {
    structure: clamp(Math.min(structure, length)),
    specificity: clamp(length),
    impact: clamp(impact),
    ownership: clamp(ownership),
    relevance: clamp(2),
  };
}

/** Deterministic gap for the degraded path, matching GAP_PRIORITY ordering. */
export function heuristicGap(scores: Scores): Dimension {
  const order: Dimension[] = [
    "ownership",
    "impact",
    "specificity",
    "structure",
    "relevance",
  ];
  return order.reduce((lowest, d) =>
    scores[d] < scores[lowest] ? d : lowest,
  );
}
