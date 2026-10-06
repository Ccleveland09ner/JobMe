/**
 * One score: label, a 1-4 bar, and the number. The number is always rendered
 * — colour never carries the meaning alone.
 * Ref: docs/PRD-JobMe-MVP.md > Non-Functional Requirements > Accessibility
 *
 * Takes fractional values too (session averages), displayed to one decimal.
 */

import { scoreLevel } from "@/lib/frontend/adapters";

const FILL: Record<1 | 2 | 3 | 4, string> = {
  1: "bg-score-1",
  2: "bg-score-2",
  3: "bg-score-3",
  4: "bg-score-4",
};

export const SCORE_MAX = 4;

export function ScoreBar({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: number;
  compact?: boolean;
}) {
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(1);
  const pct = Math.min(100, Math.max(0, (value / SCORE_MAX) * 100));

  return (
    <div className="grid grid-cols-[minmax(5.5rem,auto)_1fr_2rem] items-center gap-2 text-sm">
      <span className={compact ? "text-xs text-muted" : "text-muted"}>{label}</span>
      <span
        role="img"
        aria-label={`${label}: ${shown} out of ${SCORE_MAX}`}
        className="h-2 overflow-hidden rounded-full bg-sunken"
      >
        <span className={`block h-full rounded-full ${FILL[scoreLevel(value)]}`} style={{ width: `${pct}%` }} />
      </span>
      <span aria-hidden="true" className="text-right font-medium tabular-nums">
        {shown}
      </span>
    </div>
  );
}
