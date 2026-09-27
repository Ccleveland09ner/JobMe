/**
 * The gate between model-drafted wording and the candidate. The engine decides
 * the MOVE; this only decides whether the wording for it is usable, and
 * substitutes a bank seed when it is not. Nothing here may change the move —
 * that would put flow control in the AI.
 *
 * Ref: PRD > Adaptive Engine
 */

import { GAP_PRIORITY } from "../engine/types";
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

/** Mechanical only — a quality judgement would mean another model call. */
export function checkDraft(draft: string, askedQuestions: string[] = []): DraftCheck {
  const text = draft.trim();

  if (!text) return { ok: false, reason: "empty" };

  if (text.split(/\s+/).length > MAX_DRAFT_WORDS) {
    return { ok: false, reason: "too_long" };
  }

  if (!text.endsWith("?")) return { ok: false, reason: "not_a_question" };

  // Two questions lets the candidate pick which to answer — exactly the
  // gap-dodging the follow-up exists to close.
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
 * Runs BEFORE the model — the demo's insurance policy. A one-point relevance
 * swing flips the band and therefore the move, and an answer this thin cannot
 * be strong under any rubric, so deciding it in code makes "scripted weak
 * answer always gets a Clarify" true rather than likely.
 */
export const MIN_SUBSTANTIVE_WORDS = 25;

export function preClassify(answer: string): Band | null {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  if (words.length < MIN_SUBSTANTIVE_WORDS) return "weak";
  if (!hasNumber(answer) && !hasProperNoun(answer)) return "weak";
  return null;
}

function hasNumber(text: string): boolean {
  return /\d/.test(text);
}

/**
 * A capitalised word that is NOT sentence-initial — a proxy for naming a real
 * system, tool or company. Walks sentences rather than using one regex,
 * because the obvious pattern matches the word AFTER a full stop, which is
 * precisely what must be excluded; that bug silently disabled this check for
 * every multi-sentence answer.
 */
export function hasProperNoun(text: string): boolean {
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const tokens = sentence.trim().split(/\s+/).filter(Boolean);
    // Skip index 0: sentence-initial capitals carry no information.
    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i].replace(/^[("']+|[)"'.,;:!?]+$/g, "");
      if (/^[A-Z][a-z]{2,}$/.test(token) || /^[A-Z]{2,}$/.test(token)) {
        // "I" and common sentence connectors are not proper nouns.
        if (!/^(I|A|The|But|And|So|Then|We|It|My|Our)$/i.test(token)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Degraded-turn scores. Crude on purpose: the point is that an interview
 * survives a 429, not that the numbers are good. The turn persists with
 * `scores: null`, so these never reach an average or a trend line.
 */
export function heuristicScores(answer: string): Scores {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const clamp = (n: number) => Math.max(1, Math.min(4, n));

  const length = words < 25 ? 1 : words < 60 ? 2 : words < 140 ? 3 : 4;
  const hasNumber = /\d/.test(answer);
  const firstPerson = /\b(I|my)\b/.test(answer);
  const hedges = /\b(we|our)\b/i.test(answer);

  // Keyword proxies per STAR component: enough to pick a plausible gap for a
  // fallback question, not enough to show as a score.
  const situation = /\b(when|while|during|at the time|last (year|term|semester))\b/i.test(answer) ? 3 : 2;
  const task = /\b(my job|my role|I was responsible|I owned|assigned|tasked)\b/i.test(answer) ? 3 : 1;
  const action = /\b(then|so I|I built|I wrote|I changed|I proposed|I ran)\b/i.test(answer) ? 3 : 2;
  const result = hasNumber ? 3 : /\b(as a result|in the end|ended up|which meant)\b/i.test(answer) ? 2 : 1;

  return {
    situation: clamp(Math.min(situation, length)),
    task: clamp(task),
    action: clamp(Math.min(action, length)),
    result: clamp(result),
    specificity: clamp(length),
    impact: clamp(hasNumber ? 3 : 1),
    ownership: clamp(firstPerson ? (hedges ? 2 : 3) : 1),
    relevance: clamp(2),
  };
}

/** Deterministic gap for the degraded path, matching GAP_PRIORITY ordering. */
export function heuristicGap(scores: Scores): Dimension {
  return GAP_PRIORITY.reduce((lowest, d) =>
    scores[d] < scores[lowest] ? d : lowest,
  );
}
