/**
 * The headline: the written summary and the session's per-dimension averages.
 *
 * `overallScores` is the backend's figure (lib/stats.ts averageScores over
 * SCORED turns only) and is displayed as-is — the client never re-averages,
 * so an unscored turn can never drag a dimension down.
 *
 * Scores are practice feedback, never framed as a prediction of a hiring
 * outcome. Ref: docs/PRD-JobMe-MVP.md > Non-Goals
 */

import { ScoreList } from "@/components/score/ScoreList";
import { Card } from "@/components/ui/Card";
import type { Scores } from "@/lib/engine/types";

export function ScoreSummary({
  summary,
  overallScores,
  answered,
  scored,
}: {
  summary: string;
  overallScores: Partial<Scores> | null;
  answered: number;
  scored: number;
}) {
  const partial = scored < answered;

  return (
    <Card as="section" aria-labelledby="summary-title" className="flex flex-col gap-5">
      <h2 id="summary-title" className="text-base font-semibold text-ink">
        Summary
      </h2>
      {summary && <p className="text-base leading-relaxed text-ink">{summary}</p>}

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Average scores, 1–4</h3>
        {overallScores ? (
          <ScoreList scores={overallScores} />
        ) : (
          <p className="text-sm text-muted">None of your answers could be scored this time, so there are no averages.</p>
        )}
        <p className="text-xs text-muted">
          {partial
            ? `Based on ${scored} of ${answered} answers. ${answered - scored} couldn't be scored and ${answered - scored === 1 ? "is" : "are"} left out of the averages.`
            : `Based on ${answered} ${answered === 1 ? "answer" : "answers"}.`}{" "}
          Practice feedback, not a prediction of any hiring decision.
        </p>
      </div>
    </Card>
  );
}
