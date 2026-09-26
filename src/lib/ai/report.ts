/**
 * Scorecard generation. One LLM call, once per session, then persisted - so a
 * revisit is a plain DB read.
 *
 * TODO(slice 5): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > Report Generator
 *      docs/PRD-JobMe-MVP.md > Scorecard
 *
 * Steps:
 *  1. Pick the weakest turn (lowest average; ties go to the earliest).
 *  2. One LLM call -> { summary (<= 80 words), rewrite (STAR, <= 170 words) }.
 *     The rewrite uses ONLY the candidate's stated facts and puts [metric]
 *     placeholders where a fact is missing. It invents nothing.
 *  3. Compute overall_scores, WPM and filler count IN CODE (lib/stats.ts).
 *  4. Insert the report, then mark the session completed.
 *
 * If the LLM fails, save with rewrite = null. The rest of the scorecard is
 * computed in code and always renders.
 */

export interface ReportDraft {
  summary: string;
  rewrite: string | null;
}

export async function generateReportText(args: {
  weakestQuestion: string;
  weakestAnswer: string;
  turnCount: number;
}): Promise<ReportDraft> {
  void args;
  throw new Error("TODO(slice 5): generateReportText not implemented");
}
