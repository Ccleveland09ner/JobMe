/**
 * Display labels for engine enums. Formatting only — nothing here decides
 * anything.
 *
 * Topic labels come from engine/topics.ts, which holds no question text: the
 * bank itself must never ship to the browser (architecture.test.ts).
 */

import { GREAT_FLOOR, WEAK_CEILING } from "../engine/classify";
import { DIMENSION_LABELS } from "../engine/dimension-names";
import { TOPICS } from "../engine/topics";
import {
  TOPIC_IDS,
  type AnyDimension,
  type Band,
  type InterviewMode,
  type Move,
  type QuestionKind,
  type QuestionSource,
  type TopicId,
} from "../engine/types";

export { DIMENSION_LABELS } from "../engine/dimension-names";

/** One line on what each dimension means, for the scorecard's legend. */
export const DIMENSION_HINTS: Record<AnyDimension, string> = {
  relevance: "Answered the question that was asked",
  specificity: "A concrete, real example or detail",
  ownership: "What you did and decided yourself",
  reasoning: "Why you chose your approach",
  outcome: "How it turned out, or what you learned",
  accuracy: "Technically correct",
  communication: "Easy to follow (never grammar or accent)",
  situation: "Context set",
  task: "Your responsibility clear",
  action: "What you did",
  result: "How it turned out",
  impact: "What changed",
};

export const TOPIC_LABELS = Object.fromEntries(TOPIC_IDS.map((id) => [id, TOPICS[id].label])) as Record<TopicId, string>;

export const KIND_LABELS: Record<QuestionKind, string> = {
  behavioral: "Behavioural",
  resume: "From your resume",
  technical: "Technical",
  problem_solving: "Problem solving",
  motivational: "Motivation",
};

export const MOVE_LABELS: Record<Move, string> = {
  opening: "Opening",
  clarify: "Clarify",
  deepen: "Deepen",
  wrap: "Wrap",
};

/**
 * What candidates read. "Mediocre" described the 2.0-3.5 middle, where most
 * solid early-career answers land, as a failing.
 */
export const BAND_LABELS: Record<Band, string> = {
  weak: "Needs work",
  mediocre: "Developing",
  great: "Strong",
};

export const SOURCE_LABELS: Record<QuestionSource, string> = {
  bank: "Interview question",
  resume: "From your resume",
};

export const MODE_LABELS: Record<InterviewMode, string> = {
  quick: "Quick interview",
  full: "Full interview",
};

/** What an interview is called: the job it was for, else its length. */
export function interviewTitle(title: string | null, mode: InterviewMode | null): string {
  return title ?? (mode ? MODE_LABELS[mode] : "Interview");
}

/** Unknown values (e.g. a topic added server-side later) fall back to raw text. */
export function topicLabel(topic: string | null | undefined): string {
  if (!topic) return "Question";
  return TOPIC_LABELS[topic as TopicId] ?? topic.replace(/_/g, " ");
}

/** The name of an answer's main gap; null when it has none. */
export function gapLabel(gap: AnyDimension | null | undefined): string | null {
  return gap ? DIMENSION_LABELS[gap] : null;
}

/** The level a 1-4 score reads as, matching the bands. */
export function scoreLevelLabel(score: number): string {
  if (score < WEAK_CEILING) return BAND_LABELS.weak;
  if (score >= GREAT_FLOOR) return BAND_LABELS.great;
  return BAND_LABELS.mediocre;
}

/** The top of the 1-4 scale every score uses. */
export const SCORE_MAX = 4;

/** A dimension's value as the bars print it: whole numbers bare, others to one decimal. */
export function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** A headline or question score, out of 4 to one decimal: "3.0 / 4". */
export function scoreOutOf(value: number): string {
  return `${value.toFixed(1)} / ${SCORE_MAX}`;
}
