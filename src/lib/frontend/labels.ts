/**
 * Display labels for engine enums. Formatting only — nothing here decides
 * anything.
 *
 * Topic labels duplicate `BANK[id].label` on purpose: importing the bank into
 * a client component would ship every question's text to the browser for the
 * sake of eleven short strings. labels.test.ts fails if the two drift apart.
 */

import type {
  Band,
  Dimension,
  InterviewMode,
  Move,
  QuestionSource,
  TopicId,
} from "../engine/types";

export const DIMENSION_LABELS: Record<Dimension, string> = {
  situation: "Situation",
  task: "Task",
  action: "Action",
  result: "Result",
  specificity: "Specificity",
  impact: "Impact",
  ownership: "Ownership",
  relevance: "Relevance",
};

export const TOPIC_LABELS: Record<TopicId, string> = {
  teamwork: "Teamwork",
  conflict: "Conflict",
  learning_fast: "Learning quickly",
  handling_failure: "Handling failure",
  leadership: "Leadership",
  problem_solving: "Problem solving",
  persuasion: "Persuasion",
  prioritisation: "Managing priorities",
  process_improvement: "Improving a process",
  pressure: "Delivering under pressure",
  technical_challenge: "Technical challenge",
};

export const MOVE_LABELS: Record<Move, string> = {
  opening: "Opening",
  clarify: "Clarify",
  deepen: "Deepen",
  wrap: "Wrap",
};

export const BAND_LABELS: Record<Band, string> = {
  weak: "Weak",
  mediocre: "Mediocre",
  great: "Great",
};

export const SOURCE_LABELS: Record<QuestionSource, string> = {
  bank: "Behavioral",
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
  return DIMENSION_LABELS[dim as Dimension] ?? dim;
}
