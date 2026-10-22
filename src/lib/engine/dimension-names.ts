/** What each scoring dimension is called, on the scorecard and in the fallback report alike. */

import type { AnyDimension } from "./types";

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
