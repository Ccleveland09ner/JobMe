/** The rewrite section: the weakest question, everything said to it, then the rewrite. */

import { kickerClass } from "@/components/ui/DocumentParts";
import { gapLabel, KIND_LABELS } from "@/lib/frontend/labels";
import type { ReportQuestion, ReportTurn } from "@/lib/frontend/report-document";

import { questionName } from "./names";

export function RewriteQuestion({ q }: { q: ReportQuestion }) {
  const gap = gapLabel(q.scoredTurn?.primaryGap);
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-muted">
        {questionName(q)} · {KIND_LABELS[q.kind]}
        {gap && ` · main gap: ${gap}`}
      </p>
      <p className="text-sm font-semibold leading-snug text-ink">{q.opening.questionText}</p>
    </div>
  );
}

/** What was said to the weakest question, follow-ups included, before its rewrite. */
export function SaidPiece({ q, turn, text, first }: { q: ReportQuestion; turn: ReportTurn; text: string; first: boolean }) {
  const opening = turn.id === q.opening.id;
  return (
    <div className="flex flex-col gap-1">
      {first && opening && <h3 className={kickerClass}>What you said</h3>}
      {first && !opening && <p className="text-xs text-muted">Follow-up: {turn.questionText}</p>}
      <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{text || "No answer recorded."}</p>
    </div>
  );
}

/** A piece of the rewrite. The first is headed for screen readers, as "What you said" is for everyone. */
export function RewriteText({ text, first }: { text: string; first: boolean }) {
  return (
    <>
      {first && <h3 className="sr-only">Rewritten answer</h3>}
      <p className="whitespace-pre-line rounded-md bg-accent-soft p-3 text-sm leading-relaxed text-ink">{text}</p>
    </>
  );
}
