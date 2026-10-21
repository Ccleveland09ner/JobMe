/**
 * Speaking stats and score rollups, computed in code so they never depend on
 * an AI call.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > Speaking Stats; docs/Scoring-Rubric.md
 */

import {
  DISPLAY_DIMENSIONS,
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

/**
 * Labelled "approximate" wherever it surfaces: Chrome drops most "um"/"uh"
 * before the server sees the transcript, so a low count means little.
 */
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
  const rollup = rollupQuestions(groupIntoQuestions(turns));
  if (rollup.overall === null) return null;
  return { ...rollup.dimensions, overall: rollup.overall } as Record<string, number>;
}
