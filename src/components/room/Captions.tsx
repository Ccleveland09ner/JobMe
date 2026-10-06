/**
 * The current question, in text.
 * Ref: docs/PRD-JobMe-MVP.md > Non-Functional Requirements > Accessibility
 *
 * Captions are ALWAYS on - they are an accessibility requirement, not a
 * setting, and they are also what keeps the room usable when TTS has fallen
 * back to the browser voice.
 *
 * `lead` (a transition into a new thread) is shown muted before the question,
 * because it is spoken before it — captions match what is said.
 */

export function Captions({
  text,
  lead,
  intro,
}: {
  text: string;
  lead?: string | null;
  intro?: string | null;
}) {
  return (
    <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-2">
      {(intro || lead) && <p className="text-base text-muted">{[intro, lead].filter(Boolean).join(" ")}</p>}
      <p className="text-xl leading-relaxed text-ink sm:text-2xl">{text}</p>
    </div>
  );
}
