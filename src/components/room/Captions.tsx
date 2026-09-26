/**
 * The current question, in text.
 *
 * TODO(slice 4): implement.
 * Ref: docs/PRD-JobMe-MVP.md > Non-Functional Requirements > Accessibility
 *
 * Captions are ALWAYS on - they are an accessibility requirement, not a
 * setting, and they are also what keeps the room usable when TTS has fallen
 * back to the browser voice.
 */

export function Captions({ text }: { text: string }) {
  return <p className="text-xl leading-relaxed text-ink">{text}</p>;
}
