"use client";

/**
 * One row in the session list: date, question count, average score, status.
 *
 * TODO(slice 6): implement.
 * Ref: docs/PRD-JobMe-MVP.md > Dashboard and Progress
 *
 * Actions: Resume (in_progress) | View (completed) | Delete.
 * Delete confirms first, then DELETE /api/sessions/[id] -> router.refresh().
 * No full reload.
 */

export function SessionRow() {
  return <li className="text-sm text-muted">{/* TODO(slice 6) */}</li>;
}
