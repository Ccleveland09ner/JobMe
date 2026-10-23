/**
 * Each 1-4 score level's colours, in one table. The classes are written out
 * in full so Tailwind finds them.
 */

import { scoreLevel } from "@/lib/frontend/adapters";

export const SCORE_LEVEL_CLASSES = {
  1: { text: "text-score-1", fill: "bg-score-1", badge: "border-score-1/30 bg-surface text-score-1" },
  2: { text: "text-score-2", fill: "bg-score-2", badge: "border-score-2/30 bg-surface text-score-2" },
  3: { text: "text-score-3", fill: "bg-score-3", badge: "border-score-3/30 bg-surface text-score-3" },
  4: { text: "text-score-4", fill: "bg-score-4", badge: "border-score-4/30 bg-surface text-score-4" },
} as const;

/** The text colour for a score, by the level it rounds to. */
export const scoreTextClass = (value: number) => SCORE_LEVEL_CLASSES[scoreLevel(value)].text;
