/** The question-by-question section: each question's scores, then the interviewer's notes on each answer. */

import { scoreTextClass } from "@/components/score/levels";
import { BandBadge } from "@/components/score/BandBadge";
import { scoreEntries } from "@/lib/frontend/adapters";
import { DIMENSION_LABELS, gapLabel, KIND_LABELS, MOVE_LABELS, scoreOutOf } from "@/lib/frontend/labels";
import type { ReportQuestion, ReportTurn } from "@/lib/frontend/report-document";

import { CandidateQuote } from "./CandidateQuote";
import { followUpName, questionName } from "./names";

export function QuestionScores({ q }: { q: ReportQuestion }) {
  const band = q.scoredTurn?.band ?? null;
  return (
    <article aria-label={questionName(q)} className="flex flex-col gap-1.5 border-t-2 border-dashed border-ink/15 pt-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="font-bold text-ink">{questionName(q)}</span>
        <span>{KIND_LABELS[q.kind]}</span>
        {q.score !== null ? (
          <>
            <span className="font-bold tabular-nums text-ink">{scoreOutOf(q.score)}</span>
            {band && <BandBadge band={band} />}
          </>
        ) : (
          <span>Not scored</span>
        )}
      </p>
      <p className="text-sm font-semibold leading-snug text-ink">{q.opening.questionText}</p>
      {q.followUps.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-muted">
          {q.followUps.map((f) => (
            <li key={f.id} className="line-clamp-2">
              <span aria-hidden="true">↳ </span>
              {f.questionType ? `${MOVE_LABELS[f.questionType]}: ` : ""}
              {f.questionText}
            </li>
          ))}
        </ul>
      )}
      {q.scores ? (
        // Only the dimensions its question type is scored on.
        <ul className="grid grid-cols-3 gap-x-2 gap-y-1">
          {scoreEntries(q.scores).map(([d, v]) => (
            <li key={d} className="flex items-baseline justify-between gap-1 rounded-sm bg-sunken px-1.5 py-0.5 text-[11px] text-muted">
              <span className="truncate">{DIMENSION_LABELS[d]}</span>
              <span className={`font-bold tabular-nums ${scoreTextClass(v)}`}>{v}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">This question couldn&rsquo;t be scored.</p>
      )}
    </article>
  );
}

export function TurnNotes({ q, turn }: { q: ReportQuestion; turn: ReportTurn }) {
  // With follow-ups, each set of notes says which answer it is about.
  const label = q.followUps.length ? (turn.id === q.opening.id ? "First answer" : followUpName(turn)) : null;
  const gap = gapLabel(turn.primaryGap);
  return (
    <div className="flex flex-col gap-1.5 text-sm leading-snug text-ink">
      {label && <p className="text-xs text-muted">{label}</p>}
      {turn.evidence && (
        <p>
          <span className="font-semibold">Quoted: </span>
          <CandidateQuote className="bg-highlight px-0.5">{turn.evidence}</CandidateQuote>
          {gap && <span className="text-muted"> (main gap: {gap})</span>}
        </p>
      )}
      {turn.note && (
        <p>
          <span className="font-semibold">Noted: </span>
          {turn.note}
        </p>
      )}
      {turn.reason && (
        <p className="text-muted">
          <span className="font-semibold text-ink">Next: </span>
          {turn.reason}
        </p>
      )}
    </div>
  );
}
