/**
 * Per-question results table.
 * Ref: docs/PRD-JobMe-MVP.md > Scorecard
 *
 * Columns: question, question type, band, then the eight rubric dimensions.
 * Unscored turns (scores = null after an eval failure) render as a dash with
 * "not scored" for screen readers — never as zeros.
 *
 * Eight score columns do not fit a phone, so the table scrolls horizontally
 * inside a focusable, labelled region (keyboard users can scroll it too).
 */

import { BandBadge } from "@/components/score/BandBadge";
import { DIMENSIONS } from "@/lib/engine/types";
import { scoreLevel } from "@/lib/frontend/adapters";
import { DIMENSION_LABELS, MOVE_LABELS, topicLabel } from "@/lib/frontend/labels";
import type { ReportTurnView } from "@/lib/frontend/types";

const SCORE_TEXT = { 1: "text-score-1", 2: "text-score-2", 3: "text-score-3", 4: "text-score-4" } as const;

export function ScoreTable({ turns }: { turns: ReportTurnView[] }) {
  return (
    <section aria-labelledby="table-title" className="flex flex-col gap-3">
      <h2 id="table-title" className="text-base font-semibold text-ink">
        Question by question
      </h2>
      <div
        role="region"
        aria-labelledby="table-title"
        tabIndex={0}
        className="overflow-x-auto rounded-xl border border-line bg-surface"
      >
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Question
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Band
              </th>
              {DIMENSIONS.map((d) => (
                <th key={d} scope="col" className="px-2 py-2 text-center font-medium">
                  {DIMENSION_LABELS[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {turns.map((t) => (
              <tr key={t.id} className="border-b border-line last:border-0">
                <th scope="row" className="max-w-72 px-3 py-2 text-left font-normal">
                  <span className="block font-medium text-ink">
                    Q{t.seq} · {topicLabel(t.topic)}
                    {t.questionType && <span className="text-muted"> · {MOVE_LABELS[t.questionType]}</span>}
                  </span>
                  <span className="line-clamp-2 text-xs text-muted">{t.questionText}</span>
                </th>
                <td className="px-3 py-2">
                  {t.band ? <BandBadge band={t.band} /> : <span className="text-xs text-muted">Not scored</span>}
                </td>
                {DIMENSIONS.map((d) => {
                  const v = t.scores?.[d];
                  return (
                    <td key={d} className="px-2 py-2 text-center tabular-nums">
                      {typeof v === "number" ? (
                        <span className={`font-medium ${SCORE_TEXT[scoreLevel(v)]}`}>{v}</span>
                      ) : (
                        <>
                          <span aria-hidden="true" className="text-muted">
                            —
                          </span>
                          <span className="sr-only">not scored</span>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
