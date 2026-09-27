/**
 * Notepad text.
 *
 * Ref: docs/PRD-JobMe-MVP.md > Recruiter's Notepad
 *
 * The model supplies the *observation* (what it noticed). The *reason* (why
 * this next question) is always built here, so it can never contradict the
 * move the engine actually took — the notepad is the product's claim that the
 * adaptivity is real, and a reason line that disagrees with the question would
 * undermine exactly that.
 */

import type { Band, Dimension, Move } from "./types";

/** What a follow-up aimed at each gap is trying to get. */
const GAP_REASON: Record<Dimension, string> = {
  situation: "No context set → asking what the situation was",
  task: "Own responsibility unclear → asking what they were accountable for",
  action: "Actions are vague → asking what they actually did",
  result: "No outcome stated → asking how it turned out",
  specificity: "Too general → asking for a concrete example",
  impact: "No measurable result → asking for impact",
  ownership: 'Says "we" throughout → asking what they changed',
  relevance: "Drifted from the question → steering back",
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

/** Shown when scoring failed. Never leaks the error to the candidate. */
export const SCORING_FAILED_LINE = "Couldn't score that one. Let's keep going.";

/** Shown for an answer under 5 words. Doesn't count toward the cap. */
export const NUDGE_LINE = "Take your time. Could you say a bit more?";

/** Acknowledgement text for the wrap turn. */
export const WRAP_LINE =
  "That's everything I wanted to cover. Let me pull your feedback together.";
