/**
 * The Recruiter's Notepad. This is the differentiator - the thing that makes
 * the adaptivity visible DURING the interview rather than after it.
 *
 * TODO(slice 2): implement.
 * Ref: docs/PRD-JobMe-MVP.md > Recruiter's Notepad
 *
 * Each entry shows:
 *   - question label (topic, move type)
 *   - 5 score bars, each WITH its number (colour never carries meaning alone)
 *   - band badge
 *   - primary gap
 *   - evidence quote, verbatim, in the mono face
 *   - one deterministic reason line, e.g.
 *     "No measurable result -> asking for impact"
 *
 * Timing is a requirement: it updates BEFORE or WHILE the next question audio
 * plays, never after.
 *
 * Earlier entries collapse into a scrollable history.
 * Never raw JSON, model names or stack traces.
 */

export function Notepad() {
  return (
    <aside className="rounded-lg border border-muted/20 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Recruiter&rsquo;s notepad
      </h2>
      {/* TODO(slice 2): current entry + collapsible history */}
    </aside>
  );
}
