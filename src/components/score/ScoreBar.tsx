/** One score: label, a 1–4 bar and the number (never colour alone). Averages show one decimal. */

import { scoreLevel } from "@/lib/frontend/adapters";
import { formatScore, SCORE_MAX } from "@/lib/frontend/labels";

import { SCORE_LEVEL_CLASSES } from "./levels";

export function ScoreBar({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: number;
  compact?: boolean;
}) {
  const shown = formatScore(value);
  const pct = Math.min(100, Math.max(0, (value / SCORE_MAX) * 100));

  return (
    <div className="grid grid-cols-[minmax(5.5rem,auto)_1fr_2rem] items-center gap-2 text-sm">
      <span className={compact ? "text-xs text-muted" : "text-muted"}>{label}</span>
      <span
        role="img"
        aria-label={`${label}: ${shown} out of ${SCORE_MAX}`}
        className="h-2 overflow-hidden rounded-full bg-sunken"
      >
        <span className={`block h-full rounded-full ${SCORE_LEVEL_CLASSES[scoreLevel(value)].fill}`} style={{ width: `${pct}%` }} />
      </span>
      <span aria-hidden="true" className="text-right font-medium tabular-nums">
        {shown}
      </span>
    </div>
  );
}
