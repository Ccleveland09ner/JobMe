/**
 * Per-question results table.
 * Ref: docs/PRD-JobMe-MVP.md > Scorecard; docs/Scoring-Rubric.md
 *
 * One row per ORIGINAL question. Follow-ups are listed inside the row they
 * belong to, because what the candidate said to them is part of that answer:
 * the row's scores are the latest cumulative evaluation, which already counts
 * everything the follow-ups added.
 *
 * Columns are the dimensions any row was scored on. Each question type has
 * its own subset, so a dimension that does not apply to a row reads "n/a" —
 * distinct from "—", an answer that could not be scored, and never a zero.
 *
 * Several score columns do not fit a phone, so the table scrolls horizontally
 * inside a focusable, labelled region (keyboard users can scroll it too).
 */

import { BandBadge } from "@/components/score/BandBadge";
import { DISPLAY_DIMENSIONS } from "@/lib/engine/types";
import { scoreLevel } from "@/lib/frontend/adapters";
import { DIMENSION_LABELS, KIND_LABELS, MOVE_LABELS } from "@/lib/frontend/labels";
import type { ReportQuestionView } from "@/lib/frontend/types";

const SCORE_TEXT = { 1: "text-score-1", 2: "text-score-2", 3: "text-score-3", 4: "text-score-4" } as const;

export function ScoreTable({ questions }: { questions: ReportQuestionView[] }) {
  const columns = DISPLAY_DIMENSIONS.filter((d) =>
    questions.some((q) => typeof q.scores?.[d] === "number"),
  );

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
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Question
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Score
              </th>
              {columns.map((d) => (
                <th key={d} scope="col" className="px-2 py-2 text-center font-medium">
                  {DIMENSION_LABELS[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => {
              const band = q.scoredTurn?.band ?? null;
              return (
                <tr key={q.opening.id} className="border-b border-line align-top last:border-0">
                  <th scope="row" className="max-w-80 px-3 py-2 text-left font-normal">
                    <span className="block font-medium text-ink">
                      {q.ref} · {q.label}
                      <span className="text-muted"> · {KIND_LABELS[q.kind]}</span>
                    </span>
                    <span className="line-clamp-2 text-xs text-muted">{q.opening.questionText}</span>
                    {q.followUps.length > 0 && (
                      <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
                        {q.followUps.map((f) => (
                          <li key={f.id} className="line-clamp-1">
                            ↳ {f.questionType ? `${MOVE_LABELS[f.questionType]}: ` : ""}
                            {f.questionText}
                          </li>
                        ))}
                      </ul>
                    )}
                  </th>
                  <td className="px-3 py-2">
                    {q.score !== null ? (
                      <span className="flex flex-col items-start gap-1">
                        <span className="font-medium tabular-nums text-ink">{q.score.toFixed(1)}</span>
                        {band && <BandBadge band={band} />}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">Not scored</span>
                    )}
                  </td>
                  {columns.map((d) => {
                    const v = q.scores?.[d];
                    return (
                      <td key={d} className="px-2 py-2 text-center tabular-nums">
                        {typeof v === "number" ? (
                          <span className={`font-medium ${SCORE_TEXT[scoreLevel(v)]}`}>{v}</span>
                        ) : q.scores ? (
                          <span className="text-xs text-muted">
                            n/a<span className="sr-only"> for this question type</span>
                          </span>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
