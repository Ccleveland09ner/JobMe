/**
 * The gate between drafted wording and the candidate: unusable wording is
 * replaced by a bank seed. Nothing here may change the move.
 */

import { computePrimaryGap } from "../engine/classify";
import { dimensionsFor } from "../engine/types";
import type { Band, Dimension, QuestionKind, Scores } from "../engine/types";

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

/** Mechanical only — a quality judgement would mean another model call. */
export function checkDraft(draft: string, askedQuestions: string[] = []): DraftCheck {
  const text = draft.trim();

  if (!text) return { ok: false, reason: "empty" };

  if (text.split(/\s+/).length > MAX_DRAFT_WORDS) {
    return { ok: false, reason: "too_long" };
  }

  if (!text.endsWith("?")) return { ok: false, reason: "not_a_question" };

  // Two questions would let the candidate dodge the gap.
  if ((text.match(/\?/g) ?? []).length > 1) {
    return { ok: false, reason: "multi_question" };
  }

  // A placeholder reaching the candidate reveals that we rewrote their resume.
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

    // No seed: a flawed question beats silence. Repairs are cosmetic.
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
 * Runs BEFORE the model — the demo's insurance policy. An OPENING this thin
 * cannot answer a question under any rubric, so deciding it in code makes
 * "the scripted weak answer always gets a Clarify" true rather than likely.
 *
 * Deliberately narrow. The previous version also forced `weak` on any answer
 * with no digit and no mid-sentence capital, and on anything under 25 words.
 * Measured against the calibration fixtures, that overrode the model on good
 * answers: a qualitative story the model scored 4/4 was banded weak, and so
 * was every voice answer, because Chrome's recogniser returns lowercase text
 * without punctuation. It also caught focused follow-up replies, which are
 * short by design. Ref: docs/Scoring-Rubric.md
 */
export const MIN_SUBSTANTIVE_WORDS = 12;

export function preClassify(answer: string, questionType: string = "opening"): Band | null {
  // A follow-up reply adds to the original answer; short is what was asked for.
  if (questionType !== "opening") return null;
  const words = answer.trim().split(/\s+/).filter(Boolean);
  return words.length < MIN_SUBSTANTIVE_WORDS ? "weak" : null;
}

/**
 * Degraded-turn scores. Crude on purpose: the point is that an interview
 * survives a 429, not that the numbers are good. The turn persists with
 * `scores: null`, so these never reach an average or a trend line — they only
 * pick a plausible gap for the fallback follow-up.
 */
export function heuristicScores(answer: string, kind: QuestionKind = "behavioral"): Scores {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const clamp = (n: number) => Math.max(1, Math.min(4, n));

  const length = words < 25 ? 1 : words < 60 ? 2 : words < 140 ? 3 : 4;
  const firstPerson = /\b(I|my)\b/i.test(answer);
  const because = /\b(because|so that|since|which meant|the reason|trade-?off)\b/i.test(answer);
  const outcome = /\b(as a result|in the end|ended up|which meant|afterwards|learned|so now)\b/i.test(answer);

  const all: Scores = {
    relevance: 2,
    specificity: clamp(length),
    ownership: firstPerson ? 3 : 1,
    reasoning: because ? 3 : 2,
    outcome: outcome ? 3 : 1,
    accuracy: 2,
    communication: 3,
  };
  return Object.fromEntries(
    dimensionsFor(kind).map((d) => [d, all[d]]),
  ) as Scores;
}

/** Deterministic gap for the degraded path, matching GAP_PRIORITY ordering. */
export function heuristicGap(scores: Scores, kind: QuestionKind = "behavioral"): Dimension {
  return computePrimaryGap(scores, kind);
}

/** A planned opening may run longer than a follow-up. */
export const MAX_OPENING_WORDS = 30;

/** Mechanical checks for an opening (like checkDraft, but statements and a little more length are fine). */
export function checkOpening(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.split(/\s+/).length > MAX_OPENING_WORDS) return false;
  if (!/[.?]$/.test(t)) return false;
  if ((t.match(/\?/g) ?? []).length > 1) return false;
  // A leaked placeholder or piece of prompt structure would be read aloud.
  if (/[<>{}]|\[[A-Za-z_ ]+\]/.test(t)) return false;
  return true;
}
