"use client";

/**
 * Per-dimension score trend across completed sessions.
 *
 * TODO(slice 6): implement with Recharts (see README > Dependencies).
 * Ref: docs/PRD-JobMe-MVP.md > Dashboard and Progress
 *
 * 5 labelled series, chronological. Needs >= 2 completed sessions; below that
 * the parent shows "Complete 2 interviews to see trends."
 *
 * Cut order says this degrades to a plain averages table before anything in
 * the kernel gets touched. Ref: TechDesign > Build Plan
 */

export function TrendChart() {
  return <div className="text-sm text-muted">{/* TODO(slice 6) */}</div>;
}
