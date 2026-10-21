/**
 * Interview progress, as the server sent it: "Full interview · Question 12 of
 * up to 22 · Resume coverage 4 of 6". Missing parts are dropped.
 */

import { MODE_LABELS } from "@/lib/frontend/labels";
import type { ProgressView } from "@/lib/frontend/types";

export function ProgressPill({ progress }: { progress: ProgressView }) {
  const { mode, questionCount, questionCap, coverageDone, coverageTotal } = progress;

  const parts = [
    mode ? MODE_LABELS[mode] : null,
    questionCap ? `Question ${questionCount} of up to ${questionCap}` : `Question ${questionCount}`,
    coverageTotal && coverageTotal > 0 ? `Resume coverage ${coverageDone ?? 0} of ${coverageTotal}` : null,
  ].filter(Boolean);

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden="true">·</span>}
          <span className={i === 1 ? "font-medium text-ink" : undefined}>{part}</span>
        </span>
      ))}
    </p>
  );
}
