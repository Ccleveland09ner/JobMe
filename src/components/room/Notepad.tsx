/**
 * The Recruiter's Notepad. This is the differentiator - the thing that makes
 * the adaptivity visible DURING the interview rather than after it.
 * Ref: docs/PRD-JobMe-MVP.md > Recruiter's Notepad
 *
 * The latest entry is shown in full; earlier entries collapse into a
 * scrollable history of <details>, so the panel stays scannable at question
 * twenty of a Full interview.
 *
 * Timing is a requirement: the room appends the entry as soon as the turn
 * response arrives — BEFORE the next question is spoken, never after.
 *
 * Never raw JSON, model names or stack traces: entries render only the
 * NoteView fields.
 */

import type { NoteView } from "@/lib/frontend/types";

import { NotepadEntry, noteLabel } from "./NotepadEntry";

export function Notepad({ notes }: { notes: NoteView[] }) {
  const latest = notes.at(-1);
  const history = notes.slice(0, -1).reverse();

  return (
    <aside
      aria-labelledby="notepad-title"
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto"
    >
      <h2 id="notepad-title" className="text-xs font-semibold uppercase tracking-wide text-muted">
        Recruiter&rsquo;s notepad
      </h2>

      {/* Announce the gist, not eight score bars: observation and next move. */}
      <p aria-live="polite" className="sr-only">
        {latest
          ? `Notepad updated. ${latest.degraded ? "Scoring unavailable for this answer." : latest.observation} ${latest.reason}`
          : ""}
      </p>

      <div>
        {latest ? (
          <NotepadEntry key={latest.seq} note={latest} />
        ) : (
          <p className="text-sm text-muted">
            After each answer, you&rsquo;ll see what the recruiter noticed and why they ask what they ask next.
          </p>
        )}
      </div>

      {history.length > 0 && (
        <section aria-labelledby="notepad-history" className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 id="notepad-history" className="text-xs font-semibold uppercase tracking-wide text-muted">
            Earlier notes
          </h3>
          <ul className="flex flex-col gap-1">
            {history.map((note) => (
              <li key={note.seq}>
                <details className="group rounded-lg border border-line px-3 py-2">
                  <summary className="cursor-pointer text-sm text-ink marker:text-muted">{noteLabel(note)}</summary>
                  <div className="mt-3">
                    <NotepadEntry note={note} headingLevel="h4" />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
