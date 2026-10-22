/**
 * Notepad text. The model supplies the observation; the reason line is built
 * here, so it can never contradict the move the engine took.
 */

import type { Band, Dimension, Move, QuestionSource } from "./types";

/** What a follow-up aimed at each gap is trying to get. */
const GAP_REASON: Record<Dimension, string> = {
  relevance: "Drifted from the question → steering back",
  specificity: "Still general → asking for a concrete example",
  ownership: "Own part unclear → asking what they did themselves",
  reasoning: "The why is missing → asking how they decided",
  outcome: "No outcome yet → asking how it turned out",
  accuracy: "Part of that looks off → checking their understanding",
  communication: "Hard to follow → asking them to walk through it",
};

export function reasonLine(move: Move, gap: Dimension, band: Band): string {
  switch (move) {
    case "clarify":
      return GAP_REASON[gap];
    case "deepen":
      return band === "great"
        ? "Strong answer → pushing for trade-offs"
        : "Solid ground → pushing for more depth";
    case "opening":
      return "New topic";
    case "wrap":
      return "Enough covered → wrapping up";
  }
}

/** Shown when a follow-up restated the previous answer instead of expanding. */
export const REPEAT_LINE =
  "Restated the last answer → asking for something new";

/**
 * Shown when the candidate said they have no such experience. The interview
 * moves on instead of pressing for a story they would have to invent.
 */
export const NO_EXPERIENCE_LINE = "No direct experience → moving on";

/** Shown when scoring failed. Never leaks the error to the candidate. */
export const SCORING_FAILED_LINE = "Couldn't score that one. Let's keep going.";

/** Shown for an answer under 5 words. Doesn't count toward the cap. */
export const NUDGE_LINE = "Take your time. Could you say a bit more?";

/**
 * Spoken once, before the first question. Says up front that any real
 * experience counts, so a student does not hear "tell me about a time" as a
 * request for workplace stories they do not have.
 */
export function introLineFor(name: string, notTailored = false): string {
  return [
    `Thanks for making the time, ${name}.`,
    // Said out loud rather than buried in a flag nothing reads: the candidate
    // gave job details expecting a tailored interview and should know when
    // the tailoring failed.
    notTailored
      ? "I couldn't tailor every question to the job details you gave this time, so some will be standard ones for this kind of role."
      : null,
    "When I ask about your experience, examples from school, work, clubs or personal projects all count.",
    "Let's get started.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Acknowledgement text for the wrap turn. */
export const WRAP_LINE =
  "That's everything I wanted to cover. Let me pull your feedback together.";

const BANK_LEADS = [
  "Let's switch gears.",
  "Okay, something different now.",
  "Let me take us somewhere else.",
];

const RESUME_LEADS = [
  "I'd like to ask about something on your resume.",
  "Let's talk about your experience for a moment.",
  "Something on your resume caught my eye.",
];

/** Spoken before a new thread's opening; picked by position, not at random (reproducible). */
export function transitionLead(source: QuestionSource, position: number): string {
  const leads = source === "resume" ? RESUME_LEADS : BANK_LEADS;
  return leads[Math.abs(Math.trunc(position)) % leads.length];
}
