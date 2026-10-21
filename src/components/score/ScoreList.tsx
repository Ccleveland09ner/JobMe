/**
 * The rubric as bars, in display order. Only the dimensions present are
 * shown: each question type is scored on its own subset (a technical answer
 * has no Ownership bar), and legacy STAR rows still render honestly.
 */

import type { AnyDimension, StoredScores } from "@/lib/engine/types";
import { scoreEntries } from "@/lib/frontend/adapters";
import { DIMENSION_LABELS } from "@/lib/frontend/labels";

import { ScoreBar } from "./ScoreBar";

export function ScoreList({
  scores,
  highlight,
  compact = false,
}: {
  scores: StoredScores;
  /** Marks one dimension, e.g. the primary gap. */
  highlight?: AnyDimension | null;
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
