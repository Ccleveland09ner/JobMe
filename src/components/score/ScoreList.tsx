/**
 * The rubric as bars, in rubric order: the four STAR components, then
 * Specificity, Impact, Ownership, Relevance. Dimensions without a value are
 * skipped, so partial or legacy data still renders honestly.
 */

import type { Dimension, Scores } from "@/lib/engine/types";
import { scoreEntries } from "@/lib/frontend/adapters";
import { DIMENSION_LABELS } from "@/lib/frontend/labels";

import { ScoreBar } from "./ScoreBar";

export function ScoreList({
  scores,
  highlight,
  compact = false,
}: {
  scores: Partial<Scores>;
  /** Marks one dimension, e.g. the primary gap. */
  highlight?: Dimension | null;
  compact?: boolean;
}) {
  const entries = scoreEntries(scores);
  return (
    <ul className={`flex flex-col ${compact ? "gap-1" : "gap-1.5"}`}>
      {entries.map(([dim, value]) => (
        <li key={dim} className={dim === highlight ? "rounded-md bg-sunken px-1 -mx-1" : undefined}>
          <ScoreBar label={DIMENSION_LABELS[dim]} value={value} compact={compact} />
        </li>
      ))}
    </ul>
  );
}
