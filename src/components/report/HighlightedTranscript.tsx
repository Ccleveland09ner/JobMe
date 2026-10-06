/**
 * Full transcript with each answer's evidence quote marked and tagged.
 * Ref: docs/TechDesign-JobMe-MVP.md > Scorecard Page
 *
 * The turn's `evidence` is located inside the answer case-insensitively
 * (findEvidence) and wrapped in <mark> with its gap tag.
 *
 * FALLBACK THAT MATTERS: if there is no match, the quote is shown beneath the
 * answer instead. Never dropped silently, never a crash over it.
 */

import { DIMENSION_LABELS, MOVE_LABELS, topicLabel } from "@/lib/frontend/labels";
import { findEvidence } from "@/lib/frontend/adapters";
import type { ReportTurnView } from "@/lib/frontend/types";

export function HighlightedTranscript({ turns }: { turns: ReportTurnView[] }) {
  return (
    <section aria-labelledby="transcript-title" className="flex flex-col gap-3">
      <h2 id="transcript-title" className="text-base font-semibold text-ink">
        Transcript
      </h2>
      <ol className="flex flex-col gap-4">
        {turns.map((t) => (
          <li key={t.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted">
                Q{t.seq} · {topicLabel(t.topic)}
                {t.questionType && ` · ${MOVE_LABELS[t.questionType]}`}
              </p>
              <p className="font-medium text-ink">{t.questionText}</p>
            </div>
            <Answer turn={t} />
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
          Highlighted: <span className="font-medium text-ink">{gap}</span> was the main gap in this answer.
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
