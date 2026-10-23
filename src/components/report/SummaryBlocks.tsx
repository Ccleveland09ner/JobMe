/** The summary section: scores by question and by dimension, strengths, and speaking. */

import { scoreTextClass } from "@/components/score/levels";
import { ScoreBar } from "@/components/score/ScoreBar";
import { ScoreList } from "@/components/score/ScoreList";
import { kickerClass, SpeakingStats } from "@/components/ui/DocumentParts";
import { scoreEntries } from "@/lib/frontend/adapters";
import { DIMENSION_HINTS, DIMENSION_LABELS, formatScore, KIND_LABELS } from "@/lib/frontend/labels";
import { questionCounts, strengths, type ReportDocument } from "@/lib/frontend/report-document";

import { questionName } from "./names";

/** One block of the competency list. A long list runs on in blocks, its items numbered as one list. */
export function Competencies({ doc, range: [from, to] }: { doc: ReportDocument; range: [number, number] }) {
  return (
    <div className="flex flex-col gap-2">
      {from === 0 && <h3 className={kickerClass}>By competency</h3>}
      <ul className="flex flex-col gap-2.5">
        {doc.questions.slice(from, to).map((q, i) => (
          <li key={q.opening.id} aria-setsize={doc.questions.length} aria-posinset={from + i + 1} className="flex flex-col gap-0.5">
            {q.score !== null ? (
              <ScoreBar label={questionName(q)} value={Number(q.score.toFixed(1))} />
            ) : (
              <p className="text-sm text-ink">
                {questionName(q)} <span className="text-muted">— not scored</span>
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
  );
}

export function Averages({ doc }: { doc: ReportDocument }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className={kickerClass}>Average by dimension, 1–4</h3>
      {doc.overallScores ? (
        <ScoreList scores={doc.overallScores} />
      ) : (
        <p className="text-sm text-muted">None of your answers could be scored this time, so there are no averages.</p>
      )}
    </div>
  );
}

/** What each dimension means, and what the averages are based on. */
export function DimensionKey({ doc }: { doc: ReportDocument }) {
  const { answered, scored } = questionCounts(doc);
  const left = answered - scored;
  return (
    <div className="flex flex-col gap-2 text-xs text-muted">
      {doc.overallScores && (
        <dl className="flex flex-col gap-0.5">
          {scoreEntries(doc.overallScores).map(([d]) => (
            <div key={d} className="flex gap-1">
              <dt className="font-medium text-ink">{DIMENSION_LABELS[d]}:</dt>
              <dd>{DIMENSION_HINTS[d]}</dd>
            </div>
          ))}
        </dl>
      )}
      <p>
        {left > 0
          ? `Based on ${scored} of ${answered} questions. ${left} couldn't be scored and ${left === 1 ? "is" : "are"} left out.`
          : `Based on ${answered} ${answered === 1 ? "question" : "questions"}.`}{" "}
        Follow-up answers count toward the question they followed. Each dimension is averaged only over the questions it
        applies to.
      </p>
    </div>
  );
}

/** The strongest and weakest averages, printed as the bars print them. */
export function Strengths({ doc }: { doc: ReportDocument }) {
  const { strongest, weakest } = strengths(doc.overallScores);
  const list = (title: string, rows: typeof strongest) => (
    <div className="flex flex-col gap-1">
      <h3 className={kickerClass}>{title}</h3>
      <ul className="flex flex-col gap-0.5">
        {rows.map(([dim, value]) => (
          <li key={dim} className="flex items-baseline justify-between gap-2 text-sm text-ink">
            {DIMENSION_LABELS[dim]}
            <span className={`font-semibold tabular-nums ${scoreTextClass(value)}`}>{formatScore(value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-5 rounded-md border-2 border-ink/15 px-3 py-2.5">
      {list("Strongest", strongest)}
      {weakest.length > 0 && list("To work on", weakest)}
    </div>
  );
}

export function Speaking({ doc }: { doc: ReportDocument }) {
  const stats = doc.report?.stats;
  return (
    <div className="flex flex-col gap-2">
      <h3 className={kickerClass}>Speaking</h3>
      <SpeakingStats
        size="lg"
        explainWpm
        wpm={stats?.wpm ?? null}
        fillers={stats?.fillers ?? null}
        className="grid grid-cols-2 gap-4"
      />
    </div>
  );
}
