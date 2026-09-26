/**
 * Words per minute and filler count.
 *
 * TODO(slice 5): implement.
 * Ref: docs/PRD-JobMe-MVP.md > Scorecard
 *
 * Per answer and overall. Computed in code (lib/stats.ts), so this section
 * renders even when every AI call failed.
 *
 * Label the filler count "approximate" - Chrome's STT drops most um/uh before
 * we see the text, and claiming precision we do not have would be the wrong
 * kind of confident.
 */

export function SpeakingStats() {
  return <section className="text-sm">{/* TODO(slice 5) */}</section>;
}
