/**
 * Full transcript with each answer's evidence quote marked and tagged.
 *
 * TODO(slice 5): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > Scorecard Page
 *
 * Find the turn's `evidence` inside answer_transcript (case-insensitive) and
 * wrap it in <mark> with the gap tag.
 *
 * FALLBACK THAT MATTERS: if there is no match - the model paraphrased despite
 * being told to quote verbatim - show the quote beneath the answer instead.
 * Never drop it silently and never crash the page over it.
 */

export function HighlightedTranscript() {
  return <div className="flex flex-col gap-4">{/* TODO(slice 5) */}</div>;
}
