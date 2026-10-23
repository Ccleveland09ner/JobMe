/**
 * One Recruiter's Notepad entry: scores, the gap, the evidence and what comes
 * next. An unscored turn says so instead of showing zero bars.
 */

import { CandidateQuote } from "@/components/report/CandidateQuote";
import { BandBadge } from "@/components/score/BandBadge";
import { ScoreList } from "@/components/score/ScoreList";
import { Badge } from "@/components/ui/Badge";
import { gapLabel, MOVE_LABELS, topicLabel } from "@/lib/frontend/labels";
import type { NoteView } from "@/lib/frontend/types";

function noteLabel(note: NoteView): string {
  return `Q${note.seq} · ${topicLabel(note.topic)} · ${MOVE_LABELS[note.questionType]}`;
}

export function NotepadEntry({ note, headingLevel = "h3" }: { note: NoteView; headingLevel?: "h3" | "h4" }) {
  const Heading = headingLevel;
  const gap = note.degraded ? null : gapLabel(note.primaryGap);
  return (
    <article className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <Heading className="text-sm font-semibold text-ink">{noteLabel(note)}</Heading>
        <span className="flex flex-wrap gap-1.5">
          {note.source === "resume" && <Badge tone="accent">From your resume</Badge>}
          {note.band && <BandBadge band={note.band} />}
        </span>
      </header>

      {note.degraded || !note.scores ? (
        <p className="rounded-lg bg-sunken px-3 py-2 text-sm text-ink">
          Scoring unavailable for this answer. The interview continued with a standard follow-up.
        </p>
      ) : (
        <ScoreList scores={note.scores} highlight={note.primaryGap} compact />
      )}

      {gap && (
        <p className="text-sm">
          <span className="text-muted">Gap: </span>
          <span className="font-medium text-ink">{gap}</span>
        </p>
      )}

      {note.evidence && (
        <CandidateQuote block className="border-l-2 border-line pl-3 font-mono text-xs leading-relaxed text-ink">
          {note.evidence}
        </CandidateQuote>
      )}

      {note.observation && <p className="text-sm text-ink">{note.observation}</p>}
      {note.reason && (
        <p className="text-sm text-accent-strong">
          <span aria-hidden="true">→ </span>
          <span className="sr-only">Next: </span>
          {note.reason}
        </p>
      )}
    </article>
  );
}
