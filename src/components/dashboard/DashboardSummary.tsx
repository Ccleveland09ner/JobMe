/**
 * At-a-glance progress: how many interviews, and the latest scorecard's
 * per-dimension averages exactly as the backend stored them.
 */

import { ScoreList } from "@/components/score/ScoreList";
import { Card } from "@/components/ui/Card";
import type { Scores } from "@/lib/engine/types";
import { displayAverage } from "@/lib/frontend/adapters";

export function DashboardSummary({
  completed,
  inProgress,
  latestScores,
}: {
  completed: number;
  inProgress: number;
  /** overall_scores of the most recent completed interview. */
  latestScores: Partial<Scores> | null;
}) {
  const latestAverage = displayAverage(latestScores);

  return (
    <Card as="section" aria-labelledby="summary-title" className="flex flex-col gap-5">
      <h2 id="summary-title" className="text-base font-semibold text-ink">
        Your progress
      </h2>
      <dl className="grid grid-cols-3 gap-4">
        <Stat label="Completed" value={String(completed)} />
        <Stat label="In progress" value={String(inProgress)} />
        <Stat label="Latest average" value={latestAverage === null ? "—" : `${latestAverage} / 4`} />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}
