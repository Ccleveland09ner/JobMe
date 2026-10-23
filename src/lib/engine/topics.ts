/**
 * Each topic's name and what it assesses, apart from the question bank so
 * the browser can label a scorecard without loading every question's text.
 */

import type { TopicId } from "./types";

export const TOPICS: Record<TopicId, { label: string; purpose: string }> = {
  motivation: {
    label: "Motivation and fit",
    purpose: "why you want this role and how your background connects to it",
  },
  teamwork: {
    label: "Teamwork",
    purpose: "how you work with others to get something done",
  },
  conflict: {
    label: "Handling disagreement",
    purpose: "how you handle a disagreement and keep the work moving",
  },
  learning_fast: {
    label: "Learning quickly",
    purpose: "how you get up to speed on something new",
  },
  handling_failure: {
    label: "Learning from setbacks",
    purpose: "how you respond when something goes wrong, and what you take from it",
  },
  leadership: {
    label: "Leadership",
    purpose: "how you take the lead and bring people with you",
  },
  problem_solving: {
    label: "Problem solving",
    purpose: "how you work through a hard problem",
  },
  persuasion: {
    label: "Influencing others",
    purpose: "how you make a case and bring others round to a different approach",
  },
  prioritisation: {
    label: "Managing priorities",
    purpose: "how you decide what matters most when everything is due",
  },
  process_improvement: {
    label: "Improving a process",
    purpose: "how you spot and fix a better way of working",
  },
  pressure: {
    label: "Delivering under pressure",
    purpose: "how you deliver when time is short",
  },
  technical_challenge: {
    label: "Technical challenge",
    purpose: "how you tackle a hard piece of technical work",
  },
  technical_knowledge: {
    label: "Technical knowledge",
    purpose: "how well you understand the fundamentals the role builds on",
  },
  product_sense: {
    label: "Product sense",
    purpose: "how you think about users, priorities and trade-offs",
  },
  data_reasoning: {
    label: "Data reasoning",
    purpose: "how you reason with data to reach a sound conclusion",
  },
};

/**
 * What a topic assesses for this job: the plan's purpose, else the bank's.
 * Takes any plan shape with topic purposes, so it needs nothing outside the engine.
 */
export function purposeFor(
  plan: { topics: Partial<Record<TopicId, { purpose?: string }>> } | null | undefined,
  topic: TopicId,
): string {
  return plan?.topics[topic]?.purpose ?? TOPICS[topic]?.purpose ?? "";
}
