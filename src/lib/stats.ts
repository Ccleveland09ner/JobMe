/**
 * Speaking stats and score rollups, computed in code so they never depend on
 * an AI call.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > Speaking Stats; docs/Scoring-Rubric.md
 */

import {
  DISPLAY_DIMENSIONS,
  NEVER_A_GAP,
  questionKind,
  weightedScore,
  type AnyDimension,
  type QuestionKind,
  type StoredScores,
} from "./engine/types";

/**
 * Over CAPTURE time, not hold time: hold includes thinking pauses and
 * under-reports speaking rate by 20-40% on a considered answer, which would
 * tell a well-paced candidate they speak too slowly.
 */
export function wpm(text: string, captureMs: number): number {
  if (captureMs <= 0) return 0;
  return Math.round(wordCount(text) / (captureMs / 60000));
}

/** Approximate: Chrome drops most "um"/"uh" before the server sees the text. */
export const FILLER_RE =
  /\b(um+|uh+|erm|like|you know|basically|actually|kind of|sort of|i mean)\b/gi;

export function fillerCount(text: string): number {
  return (text.match(FILLER_RE) ?? []).length;
}

/** Under 5 words -> nudge instead of scoring, and don't count toward the cap. */
export const MIN_ANSWER_WORDS = 5;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Stored scores

const DIMENSION_SET = new Set<string>(DISPLAY_DIMENSIONS);

/** A current or legacy (pre-2026-10 STAR) dimension key. */
export function isDimension(value: unknown): value is AnyDimension {
  return typeof value === "string" && DIMENSION_SET.has(value);
}

/**
 * Keeps known dimensions with numeric values, current and legacy alike, so an
 * old session still renders; anything else (`overall`, the old `structure`
 * key) is dropped. Null or empty is unscored.
 */
export function pickScores(raw: unknown): StoredScores | null {
  if (!raw || typeof raw !== "object") return null;
  const out: StoredScores = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isDimension(key) && typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    }
  }
  return Object.keys(out).length ? out : null;
}

// ---------------------------------------------------------------------------
// Questions: a follow-up adds to the question it came from
// ---------------------------------------------------------------------------

/** The turn fields grouping needs — persisted row or view, either works. */
export interface GroupableTurn {
  seq: number;
  /** `opening` starts a question; `clarify` and `deepen` add to it. */
  questionType: string | null;
  topic: string | null;
  source?: string | null;
  /** Null means unscored: the evaluator failed and heuristics stood in. */
  scores: StoredScores | null;
}

/**
 * One ORIGINAL question and everything the candidate said to it.
 *
 * A follow-up is not a new question. When the interviewer asks for a missing
 * outcome, the reply completes the original answer, so the evaluator scores
 * each follow-up as the whole answer so far (lib/ai/prompts.ts). The latest
 * scored turn is therefore the question's score, and the earlier, less
 * complete evaluations are never averaged in — averaging them would charge
 * the candidate permanently for a gap the follow-up then filled.
 */
export interface QuestionGroup<T extends GroupableTurn> {
  opening: T;
  /** Clarify and deepen turns that added to the opening, oldest first. */
  followUps: T[];
  /** `opening` then `followUps`. */
  turns: T[];
  kind: QuestionKind;
  /** The latest cumulative evaluation; null when no turn here was scored. */
  scores: StoredScores | null;
  /** The kind's weighted score over `scores`. */
  score: number | null;
  /** The turn `scores` came from. */
  scoredTurn: T | null;
}

/**
 * Groups turns by original question, in seq order. Every `opening` starts a
 * question; any other turn joins the one before it. A follow-up with nothing
 * before it (a row lost to a failed write) stands as its own question rather
 * than vanishing.
 */
export function groupIntoQuestions<T extends GroupableTurn>(
  turns: T[],
): QuestionGroup<T>[] {
  const groups: T[][] = [];
  for (const turn of [...turns].sort((a, b) => a.seq - b.seq)) {
    const current = groups[groups.length - 1];
    if (turn.questionType === "opening" || !current) groups.push([turn]);
    else current.push(turn);
  }

  return groups.map((group) => {
    const opening = group[0];
    const kind = questionKind({ topic: opening.topic, source: opening.source });
    const scoredTurn = [...group].reverse().find((t) => t.scores) ?? null;
    const scores = scoredTurn?.scores ?? null;
    return {
      opening,
      followUps: group.slice(1),
      turns: group,
      kind,
      scores,
      score: scores ? weightedScore(scores, kind) : null,
      scoredTurn,
    };
  });
}

export interface CompetencyResult {
  topic: string;
  kind: QuestionKind;
  /** Mean of this competency's question scores, 1-4. */
  score: number;
  questions: number;
}

export interface SessionRollup {
  /** Mean of the question scores, 1-4; null when nothing was scored. */
  overall: number | null;
  /**
   * Per-dimension means, each over only the questions scored on that
   * dimension — a technical question has no Ownership, and must not count as
   * a zero in its average.
   */
  dimensions: Partial<Record<AnyDimension, number>>;
  competencies: CompetencyResult[];
  questionsAsked: number;
  questionsScored: number;
}

const round2 = (n: number) => Number(n.toFixed(2));

export function rollupQuestions<T extends GroupableTurn>(
  groups: QuestionGroup<T>[],
): SessionRollup {
  const scored = groups.filter((g) => g.scores && g.score !== null);

  const dimensions: Partial<Record<AnyDimension, number>> = {};
  for (const d of DISPLAY_DIMENSIONS) {
    const values = scored
      .map((g) => g.scores![d])
      .filter((v): v is number => typeof v === "number");
    if (values.length) {
      dimensions[d] = round2(values.reduce((a, b) => a + b, 0) / values.length);
    }
  }

  const byTopic = new Map<string, { kind: QuestionKind; scores: number[] }>();
  for (const g of scored) {
    const topic = g.opening.topic ?? "general";
    const entry = byTopic.get(topic) ?? { kind: g.kind, scores: [] };
    entry.scores.push(g.score!);
    byTopic.set(topic, entry);
  }

  return {
    overall: scored.length
      ? round2(scored.reduce((sum, g) => sum + g.score!, 0) / scored.length)
      : null,
    dimensions,
    competencies: [...byTopic].map(([topic, { kind, scores }]) => ({
      topic,
      kind,
      score: round2(scores.reduce((a, b) => a + b, 0) / scores.length),
      questions: scores.length,
    })),
    questionsAsked: groups.length,
    questionsScored: scored.length,
  };
}

/**
 * What `interview_sessions.overall_scores` stores: the per-dimension means
 * plus the `overall` figure, so the dashboard shows the same number as the
 * scorecard instead of re-deriving one. Null when nothing was scored.
 */
export function overallScoresFor(
  turns: GroupableTurn[],
): Record<string, number> | null {
  return overallScoresFrom(rollupQuestions(groupIntoQuestions(turns)));
}

/** The same, from a rollup already made. */
export function overallScoresFrom(rollup: SessionRollup): Record<string, number> | null {
  if (rollup.overall === null) return null;
  return { ...rollup.dimensions, overall: rollup.overall } as Record<string, number>;
}

/**
 * Dimensions worth naming as strengths and weaknesses: best first, and worst
 * first. Ties keep display order. NEVER_A_GAP dimensions are left out of both,
 * since a transcript is too noisy a signal of them to praise or fault.
 */
export function rankDimensions(scores: StoredScores): { best: [AnyDimension, number][]; worst: [AnyDimension, number][] } {
  const named = DISPLAY_DIMENSIONS.flatMap((d): [AnyDimension, number][] =>
    typeof scores[d] === "number" && !(NEVER_A_GAP as ReadonlySet<string>).has(d) ? [[d, scores[d]!]] : [],
  );
  return { best: [...named].sort((a, b) => b[1] - a[1]), worst: [...named].sort((a, b) => a[1] - b[1]) };
}

/** How the scorecard and its feedback cite the question at `index`: "Q1", "Q2"… */
export const questionRef = (index: number) => `Q${index + 1}`;

// The filed report

export interface FeedbackItem {
  /** Which question it is about, e.g. "Q2"; null for a session-wide point. */
  question: string | null;
  point: string;
  /** Strengths: the candidate's own words, verified verbatim. */
  quote?: string | null;
  /** Improvements: what to do differently. */
  recommendation?: string;
}

export interface ReportFeedback {
  strengths: FeedbackItem[];
  improvements: FeedbackItem[];
}

export interface ReportStats {
  /** Words over capture time across every answer; null when none was timed. */
  wpm: number | null;
  fillers: number;
  /** Chrome drops most um/uh before we see the transcript. Always say so. */
  fillersApproximate: true;
  answered: number;
  scored: number;
  /**
   * Strengths and improvements, stored here rather than in a new column so
   * the report needed no migration. Absent on reports written before 2026-10.
   */
  feedback?: ReportFeedback;
}

/**
 * Speaking stats across the session. WPM is words over total CAPTURE time
 * (not the mean of per-answer rates, which over-weights short answers), and
 * includes unscored turns — the evaluator failing says nothing about pace.
 * `answered` and `scored` count original questions: a follow-up is part of
 * the question it came from.
 */
export function reportStats(
  turns: {
    answerTranscript: string;
    captureMs: number | null;
  }[],
  rollup: Pick<SessionRollup, "questionsAsked" | "questionsScored">,
): ReportStats {
  let words = 0;
  let captureMs = 0;
  for (const turn of turns) {
    if (turn.captureMs && turn.captureMs > 0) {
      words += wordCount(turn.answerTranscript);
      captureMs += turn.captureMs;
    }
  }

  return {
    wpm: captureMs > 0 ? Math.round(words / (captureMs / 60000)) : null,
    fillers: turns.reduce((n, t) => n + fillerCount(t.answerTranscript), 0),
    fillersApproximate: true,
    answered: rollup.questionsAsked,
    scored: rollup.questionsScored,
  };
}

/**
 * Lowest score among SCORED questions; ties go to the earliest. An unscored
 * question (the evaluator failed) is never "weakest" — we do not know how it
 * scored, and rewriting it would coach against a guess.
 */
export function pickWeakest<T extends { score: number | null }>(questions: T[]): T | null {
  let weakest: T | null = null;
  for (const q of questions) {
    if (q.score === null) continue;
    // Strict: an equal score never displaces an earlier question.
    if (!weakest || q.score < weakest.score!) weakest = q;
  }
  return weakest;
}

/** A `reports` row. */
export interface ReportRow {
  summary: string | null;
  weakest_turn_id: string | null;
  rewrite_text: string | null;
  stats: unknown;
}

/** A filed report as the app reads it. `stats` is always written with the report. */
export function reportFromRow(row: ReportRow) {
  return {
    summary: row.summary ?? "",
    weakestTurnId: row.weakest_turn_id ?? null,
    rewrite: row.rewrite_text ?? null,
    stats: row.stats as ReportStats,
  };
}
