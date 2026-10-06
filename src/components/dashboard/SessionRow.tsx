/**
 * One row in the session list: date, mode, progress, average score, status,
 * and the actions that fit the status.
 * Ref: docs/PRD-JobMe-MVP.md > Dashboard and Progress
 *
 * Presentational: deletion is owned by SessionList, which holds the single
 * confirm dialog for the whole list.
 */

import Link from "next/link";

import { LocalDate } from "@/components/common/LocalDate";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { displayAverage } from "@/lib/frontend/adapters";
import { MODE_LABELS } from "@/lib/frontend/labels";
import type { SessionSummary } from "@/lib/frontend/types";

export function SessionRow({
  session,
  onDelete,
}: {
  session: SessionSummary;
  onDelete: (session: SessionSummary) => void;
}) {
  const completed = session.status === "completed";
  const average = displayAverage(session.overallScores);
  const n = session.questionCount;

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <LocalDate iso={session.startedAt} format="dateTime" className="font-medium text-ink" />
          {completed ? <Badge>Completed</Badge> : <Badge tone="accent">In progress</Badge>}
        </div>
        <p className="text-sm text-muted">
          {[
            session.mode ? MODE_LABELS[session.mode] : null,
            completed ? `${n} ${n === 1 ? "question" : "questions"}` : `On question ${n}`,
            completed ? (average === null ? "Not scored" : `Average ${average} / 4`) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {completed ? (
          <Link href={`/interview/${session.id}/report`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
            View report
          </Link>
        ) : (
          <Link href={`/interview/${session.id}`} className={buttonClasses({ size: "sm" })}>
            Resume
          </Link>
        )}
        <Button variant="ghost" size="sm" onClick={() => onDelete(session)}>
          Delete
          <span className="sr-only">
            {" "}interview from <LocalDate iso={session.startedAt} format="dateTime" />
          </span>
        </Button>
      </div>
    </li>
  );
}
