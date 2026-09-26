/**
 * Notepad text. The observation line comes from the LLM; the reason line is
 * always built here so it can never contradict the move actually taken.
 *
 * TODO(slice 2): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > Adaptive Engine > notepad.ts
 *      docs/PRD-JobMe-MVP.md > Recruiter's Notepad
 *
 * e.g. gap 'impact' + move 'clarify' -> "No measurable result -> asking for impact"
 */

import type { Band, Dimension, Move } from "./types";

export function reasonLine(move: Move, gap: Dimension, band: Band): string {
  void move;
  void gap;
  void band;
  throw new Error("TODO(slice 2): reasonLine not implemented");
}

/** Shown when scoring failed. Never leaks the error to the candidate. */
export const SCORING_FAILED_LINE = "Couldn't score that one. Let's keep going.";

/** Shown for an answer under 5 words. Doesn't count toward the cap. */
export const NUDGE_LINE = "Take your time. Could you say a bit more?";
