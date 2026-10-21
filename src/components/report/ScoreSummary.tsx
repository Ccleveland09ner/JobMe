/**
 * The headline: the written summary, the overall score, how each competency
 * went, and the session's per-dimension averages.
 *
 * Every number is the backend's: `overall` is the stored mean of the question
 * scores, and each question's score is its latest cumulative evaluation, so a
 * follow-up that filled a gap counts toward the question it came from. The
 * client never re-scores anything, so an unscored answer can never drag a
 * figure down.
 *
 * Scores are practice feedback, never framed as a prediction of a hiring
 * outcome. Ref: docs/PRD-JobMe-MVP.md > Non-Goals
 */

import { ScoreBar } from "@/components/score/ScoreBar";
import { ScoreList } from "@/components/score/ScoreList";
import { Card } from "@/components/ui/Card";
import type { StoredScores } from "@/lib/engine/types";
import { DIMENSION_HINTS, DIMENSION_LABELS, KIND_LABELS, scoreLevelLabel } from "@/lib/frontend/labels";
import { scoreEntries } from "@/lib/frontend/adapters";
import type { ReportQuestionView } from "@/lib/frontend/types";

export function ScoreSummary({
  summary,
  overall,
  overallScores,
  questions,
  answered,
  scored,
}: {
  summary: string;
  overall: number | null;
  overallScores: StoredScores | null;
  questions: ReportQuestionView[];
  /** Original questions; a follow-up is part of the question it came from. */
  answered: number;
  scored: number;
}) {
  const partial = scored < answered;

  return (
    <Card as="section" aria-labelledby="summary-title" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 id="summary-title" className="text-base font-semibold text-ink">
          Summary
        </h2>
        {overall !== null && (
          <p className="text-right">
            <span className="block text-3xl font-semibold tabular-nums text-ink">
              {overall.toFixed(1)}
              <span className="text-base font-normal text-muted"> / 4</span>
            </span>
            <span className="text-sm text-muted">Overall · {scoreLevelLabel(overall)}</span>
          </p>
        )}
      </div>
      {summary && <p className="text-base leading-relaxed text-ink">{summary}</p>}

      {questions.some((q) => q.score !== null) && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">By competency</h3>
          <ul className="flex flex-col gap-3">
            {questions.map((q) => (
              <li key={q.opening.id} className="flex flex-col gap-1">
                {q.score !== null ? (
                  <ScoreBar label={`${q.ref} · ${q.label}`} value={Number(q.score.toFixed(1))} />
                ) : (
                  <p className="text-sm text-ink">
                    {q.ref} · {q.label} <span className="text-muted">— not scored</span>
                  </p>
                )}
                <p className="text-xs text-muted">
                  {KIND_LABELS[q.kind]}
                  {q.purpose && ` · assessed ${q.purpose}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Average by dimension, 1–4</h3>
        {overallScores ? (
          <>
            <ScoreList scores={overallScores} />
            <dl className="grid gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-2">
              {scoreEntries(overallScores).map(([d]) => (
                <div key={d} className="flex gap-1">
                  <dt className="font-medium text-ink">{DIMENSION_LABELS[d]}:</dt>
                  <dd>{DIMENSION_HINTS[d]}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="text-sm text-muted">None of your answers could be scored this time, so there are no averages.</p>
        )}
        <p className="text-xs text-muted">
          {partial
            ? `Based on ${scored} of ${answered} questions. ${answered - scored} couldn't be scored and ${answered - scored === 1 ? "is" : "are"} left out.`
            : `Based on ${answered} ${answered === 1 ? "question" : "questions"}.`}{" "}
          Follow-up answers count toward the question they followed. Each dimension is averaged only over the
          questions it applies to. Practice feedback, not a prediction of any hiring decision.
        </p>
      </div>
    </Card>
  );
}
