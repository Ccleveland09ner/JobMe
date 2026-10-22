/**
 * Reading a stored question plan (lib/ai/question-plan.ts writes it). Pure,
 * so the turn pipeline, the report and the browser all read it the same way.
 */

import { alreadyAsked } from "./engine/asked";
import { levelFor, type TopicId } from "./engine/types";
import { formatRoleForPrompt } from "./jd/profile";
import { QuestionPlan } from "./schemas";

/**
 * Shorter than this, pasted text is not a job description ("asdf", a URL
 * pasted into the wrong box), and personalising on it would be noise.
 */
export const MIN_JOB_TEXT_CHARS = 80;

/** A job description long enough to be one. */
export function usableJobText(text: string | null | undefined): string | null {
  const t = text?.trim();
  return t && t.length >= MIN_JOB_TEXT_CHARS ? t : null;
}

/** The stored plan, parsed rather than trusted: a malformed one means the fixed openings, not an error. */
export function parsePlan(stored: unknown): QuestionPlan | null {
  const parsed = QuestionPlan.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

/** The job as prompts state it: the plan's distilled role, else the posting text the session stored. */
export function roleTextFor(plan: QuestionPlan | null, postingText: string | null): string | null {
  return plan?.role ? formatRoleForPrompt(plan.role) : postingText;
}

/** "Company: Acme", marked when it was read from the posting link rather than stated. */
export function companyLineFor(plan: QuestionPlan | null): string | null {
  const company = plan?.job?.company;
  if (!company) return null;
  return `Company: ${company}${plan?.job?.companyInferred ? " (read from the posting link)" : ""}`;
}

// Lookups: the turn pipeline falls back to fixed text on null.

/** Planned wording for a bank topic at a difficulty, mirroring `questionFor`. */
export function plannedBankOpening(
  plan: QuestionPlan | null | undefined,
  topic: TopicId,
  difficulty: number,
  asked: string[],
): string | null {
  const levels = plan?.topics[topic];
  if (!levels) return null;
  const text = { 1: levels.l1, 2: levels.l2, 3: levels.l3 }[levelFor(difficulty)];
  return text && !alreadyAsked(text, asked) ? text : null;
}

/** The planned opening for a resume item, with the competency it lands on. */
export function plannedResumeOpening(
  plan: QuestionPlan | null | undefined,
  itemId: string,
  asked: string[],
): { text: string; topic: TopicId | null } | null {
  const entry = plan?.resume[itemId];
  return entry && !alreadyAsked(entry.text, asked) ? entry : null;
}

/**
 * Resume items in the plan's order for THIS job. Items were ranked against
 * whatever job description accompanied the upload, which may be a different
 * job; ids the plan omitted keep their original relative order at the end.
 */
export function orderResumeItems<T extends { id: string }>(
  items: T[],
  plan: QuestionPlan | null | undefined,
): T[] {
  const order = plan?.resumeOrder ?? [];
  if (!order.length) return items;
  const rank = new Map(order.map((id, i) => [id, i]));
  const last = order.length;
  return [...items].sort((a, b) => (rank.get(a.id) ?? last) - (rank.get(b.id) ?? last));
}
