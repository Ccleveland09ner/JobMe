/**
 * At-a-glance progress: how many interviews, and the latest scorecard's
 * overall score and per-dimension averages exactly as the backend stored them.
 */

import { ScoreList } from "@/components/score/ScoreList";
import { Card } from "@/components/ui/Card";
import type { StoredScores } from "@/lib/engine/types";
import { scoreLevelLabel } from "@/lib/frontend/labels";

export function DashboardSummary({
  completed,
  inProgress,
  latestScores,
  latestOverall,
}: {
  completed: number;
  inProgress: number;
  /** overall_scores of the most recent completed interview. */
  latestScores: StoredScores | null;
  /** Its headline score, the mean of its question scores. */
  latestOverall: number | null;
}) {
  return (
    <Card as="section" aria-labelledby="summary-title" className="flex flex-col gap-5">
      <h2 id="summary-title" className="text-base font-semibold text-ink">
        Your progress
      </h2>
      <dl className="grid grid-cols-3 gap-4">
        <Stat label="Completed" value={String(completed)} />
        <Stat label="In progress" value={String(inProgress)} />
        <Stat
          label="Latest overall"
          value={latestOverall === null ? "—" : `${latestOverall} / 4`}
          note={latestOverall === null ? undefined : scoreLevelLabel(latestOverall)}
        />
      </dl>
      {latestScores ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Latest scorecard
          </h3>
          <ScoreList scores={latestScores} compact />
        </div>
      ) : (
        <p className="text-sm text-muted">Finish an interview to see your scores here.</p>
      )}
    </Card>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-ink">
        {value}
        {note && <span className="block text-xs font-normal text-muted">{note}</span>}
      </dd>
    </div>
  );
}
