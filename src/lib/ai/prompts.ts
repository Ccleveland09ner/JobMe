/**
 * Prompt text, kept out of the logic files so it can be tuned without touching
 * control flow.
 *
 * TODO(slice 2): write the rubric.
 * Ref: docs/TechDesign-JobMe-MVP.md > Evaluator
 *
 * The evaluator system prompt must contain:
 *   - the 5-dimension rubric with explicit 1/2/3/4 anchors per dimension
 *   - quote evidence VERBATIM from the answer, <= 20 words
 *   - drafts reference the candidate's own words, <= 30 words, one question each
 *   - never invent facts about the candidate
 *   - one weak and one strong few-shot example
 *
 * Prompt injection: the candidate's answer and role text are untrusted input.
 * Wrap them in delimiters and label them as data, never as instructions. The
 * model cannot change flow regardless — the state machine owns that — but the
 * rubric still needs to hold.
 * Ref: docs/TechDesign-JobMe-MVP.md > Security
 */

export const EVALUATOR_SYSTEM =
  "TODO(slice 2): rubric + rules + few-shot examples";

export const REPORT_SYSTEM = [
  "TODO(slice 5): summary (<= 80 words) + STAR rewrite (<= 170 words).",
  "Use ONLY the candidate's own facts. Put [metric] placeholders where a fact",
  "is missing. Invent no achievements.",
].join(" ");

/** Wraps untrusted candidate text so the model treats it as data, not orders. */
export function asUntrustedData(label: string, text: string): string {
  return "<" + label + ">\n" + text + "\n</" + label + ">";
}
