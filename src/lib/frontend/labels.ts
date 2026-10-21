/**
 * Display labels for engine enums. Formatting only — nothing here decides
 * anything.
 *
 * Topic labels duplicate `BANK[id].label` on purpose: importing the bank into
 * a client component would ship every question's text to the browser for the
 * sake of a few short strings. labels.test.ts fails if the two drift apart.
 */

import type {
  AnyDimension,
  Band,
  InterviewMode,
  Move,
  QuestionKind,
  QuestionSource,
  TopicId,
} from "../engine/types";

/**
 * Current dimensions, plus the pre-2026-10 STAR ones so an old session's
 * scorecard still reads.
 */
export const DIMENSION_LABELS: Record<AnyDimension, string> = {
  relevance: "Relevance",
  specificity: "Specific evidence",
  ownership: "Own contribution",
  reasoning: "Reasoning",
  outcome: "Outcome",
  accuracy: "Accuracy",
  communication: "Clarity",
  situation: "Situation",
  task: "Task",
  action: "Action",
  result: "Result",
  impact: "Impact",
};

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

export const TOPIC_LABELS: Record<TopicId, string> = {
  motivation: "Motivation and fit",
  teamwork: "Teamwork",
  conflict: "Handling disagreement",
  learning_fast: "Learning quickly",
  handling_failure: "Learning from setbacks",
  leadership: "Leadership",
  problem_solving: "Problem solving",
  persuasion: "Influencing others",
  prioritisation: "Managing priorities",
  process_improvement: "Improving a process",
  pressure: "Delivering under pressure",
  technical_challenge: "Technical challenge",
  technical_knowledge: "Technical knowledge",
  product_sense: "Product sense",
  data_reasoning: "Data reasoning",
};

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

/** Unknown values (e.g. a topic added server-side later) fall back to raw text. */
export function topicLabel(topic: string | null | undefined): string {
  if (!topic) return "Question";
  return TOPIC_LABELS[topic as TopicId] ?? topic.replace(/_/g, " ");
}

export function dimensionLabel(dim: string): string {
  return DIMENSION_LABELS[dim as AnyDimension] ?? dim;
}

/** The level a 1-4 score reads as, matching the bands. */
export function scoreLevelLabel(score: number): string {
  if (score < 2) return BAND_LABELS.weak;
  if (score >= 3.5) return BAND_LABELS.great;
  return BAND_LABELS.mediocre;
}
