/**
 * Full transcript, one entry per ORIGINAL question: the first answer, then
 * each follow-up and what the candidate added, nested beneath it. Each
 * answer's evidence quote is marked and tagged.
 * Ref: docs/TechDesign-JobMe-MVP.md > Scorecard Page
 *
 * The turn's `evidence` is located inside the answer case-insensitively
 * (findEvidence) and wrapped in <mark> with its gap tag.
 *
 * FALLBACK THAT MATTERS: if there is no match, the quote is shown beneath the
 * answer instead. Never dropped silently, never a crash over it.
 */

import { DIMENSION_LABELS, KIND_LABELS, MOVE_LABELS } from "@/lib/frontend/labels";
import { findEvidence } from "@/lib/frontend/adapters";
import type { ReportQuestionView, ReportTurnView } from "@/lib/frontend/types";

export function HighlightedTranscript({ questions }: { questions: ReportQuestionView[] }) {
  return (
    <section aria-labelledby="transcript-title" className="flex flex-col gap-3">
      <h2 id="transcript-title" className="text-base font-semibold text-ink">
        Transcript
      </h2>
      <ol className="flex flex-col gap-4">
        {questions.map((q) => (
          <li key={q.opening.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted">
                {q.ref} · {q.label} · {KIND_LABELS[q.kind]}
              </p>
              <p className="font-medium text-ink">{q.opening.questionText}</p>
            </div>
            <Answer turn={q.opening} />
            {q.followUps.length > 0 && (
              <ol className="flex flex-col gap-3 border-l-2 border-line pl-3">
                {q.followUps.map((f) => (
                  <li key={f.id} className="flex flex-col gap-1">
                    <p className="text-xs text-muted">
                      {f.questionType ? `${MOVE_LABELS[f.questionType]} follow-up` : "Follow-up"}
                    </p>
                    <p className="text-sm font-medium text-ink">{f.questionText}</p>
                    <Answer turn={f} />
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Answer({ turn }: { turn: ReportTurnView }) {
  const gap = turn.primaryGap ? DIMENSION_LABELS[turn.primaryGap] : null;
  const split = findEvidence(turn.answer, turn.evidence);

  return (
    <div className="flex flex-col gap-2">
      <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
        <span className="sr-only">Your answer: </span>
        {split ? (
          <>
            {split.before}
            <mark className="rounded bg-highlight px-0.5 text-ink">
              {split.match}
              {gap && <span className="sr-only"> (evidence for gap: {gap})</span>}
            </mark>
            {split.after}
          </>
        ) : (
          turn.answer
        )}
      </p>
      {split && gap && (
        <p className="text-xs text-muted">
          Highlighted: <span className="font-medium text-ink">{gap}</span> was the main gap at this point.
        </p>
      )}
      {!split && turn.evidence && (
        <p className="text-xs text-muted">
          {gap ? `Gap: ${gap} · ` : ""}Noted: <q className="font-mono text-ink">{turn.evidence}</q>
        </p>
      )}
      {!turn.scores && <p className="text-xs text-muted">This answer couldn&rsquo;t be scored.</p>}
    </div>
  );
}
