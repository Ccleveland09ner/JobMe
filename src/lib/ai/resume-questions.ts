/**
 * The fixed opening for a resume item. Openings are written at session start,
 * in the question plan (question-plan.ts); this stands in for an item the plan
 * has none for.
 */

import type { ResumeItem } from "../engine/types";

/**
 * A deterministic opening for a resume item, used when the plan prepared none
 * (the model was unavailable, or its draft failed the gate).
 *
 * Deliberately plain: it still names the item, so the thread is still about
 * the right thing and coverage still advances. A rate limit should cost
 * polish, never coverage. It asks about work they did rather than presuming
 * something went wrong, which not every role or project has to offer.
 */
export function fallbackResumeQuestion(item: ResumeItem): string {
  if (item.kind === "role") {
    // Labels built from the resume already read "Title at Employer".
    const employer = item.employer?.trim();
    const where = employer && !item.label.toLowerCase().includes(employer.toLowerCase()) ? ` at ${employer}` : "";
    return `Walk me through a piece of work you're proud of from your time as ${item.label}${where}.`;
  }
  return `Walk me through ${item.label} — what you built yourself, and the hardest decision you made on it.`;
}
