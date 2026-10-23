/** The transcript: every question and answer, with the evidence for each answer's main gap marked. */

import { findEvidence } from "@/lib/frontend/adapters";
import { gapLabel, KIND_LABELS } from "@/lib/frontend/labels";
import type { ReportQuestion, ReportTurn } from "@/lib/frontend/report-document";

import { CandidateQuote, EvidenceMark } from "./CandidateQuote";
import { followUpName, questionName } from "./names";

/** Follow-ups sit indented under the question they added to. */
const INDENT = "border-l-2 border-ink/20 pl-3";

/** A question, headed so the transcript can be walked question by question; follow-ups one level down. */
export function TurnQuestion({ q, turn }: { q: ReportQuestion; turn: ReportTurn }) {
  if (turn.id !== q.opening.id) {
    return (
      <div className={`flex flex-col gap-0.5 ${INDENT}`}>
        <p className="text-xs text-muted">{followUpName(turn)}</p>
        <h4 className="text-sm font-semibold leading-snug text-ink">{turn.questionText}</h4>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5 border-t-2 border-dashed border-ink/15 pt-3">
      <p className="text-xs text-muted">
        {questionName(q)} · {KIND_LABELS[q.kind]}
      </p>
      <h3 className="text-sm font-semibold leading-snug text-ink">{turn.questionText}</h3>
    </div>
  );
}

export function AnswerPiece({ turn, text, first, indent }: { turn: ReportTurn; text: string; first: boolean; indent: boolean }) {
  const gap = gapLabel(turn.primaryGap);
  const split = findEvidence(text, turn.evidence);
  if (!text) return <p className={`text-sm text-muted ${indent ? INDENT : ""}`}>No answer recorded.</p>;
  return (
    <div className={`flex flex-col gap-1.5 ${indent ? INDENT : ""}`}>
      <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
        {first && <span className="sr-only">Your answer: </span>}
        {split ? (
          <>
            {split.before}
            <EvidenceMark gap={gap}>{split.match}</EvidenceMark>
            {split.after}
          </>
        ) : (
          text
        )}
      </p>
      {split && gap && (
        <p className="text-xs text-muted">
          Highlighted: <span className="font-medium text-ink">{gap}</span> was the main gap at this point.
        </p>
      )}
    </div>
  );
}

/** Beneath an answer: a quote no piece of it holds, and whether it went unscored. */
export function TurnEvidence({ turn, quote, indent }: { turn: ReportTurn; quote: boolean; indent: boolean }) {
  const gap = gapLabel(turn.primaryGap);
  return (
    <div className={`flex flex-col gap-1 text-xs text-muted ${indent ? INDENT : ""}`}>
      {quote && turn.evidence && (
        <p>
          {gap && `Gap: ${gap} · `}Quoted: <CandidateQuote className="font-mono text-ink">{turn.evidence}</CandidateQuote>
        </p>
      )}
      {!turn.scores && <p>This answer couldn&rsquo;t be scored.</p>}
    </div>
  );
}
