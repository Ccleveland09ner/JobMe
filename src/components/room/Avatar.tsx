/**
 * The recruiter. Inline SVG, flat 2D illustrated person.
 *
 * TODO(slice 4): implement.
 * Ref: docs/PRD-JobMe-MVP.md > Look and Feel
 *      docs/TechDesign-JobMe-MVP.md > Look and Feel (Motion)
 *
 * Props: { state: 'idle'|'listening'|'thinking'|'speaking', mouth: 0..1 }
 *
 * Motion: blink every 3-6s at random, nod when listening starts, mouth opening
 * = smoothed RMS from the AnalyserNode. Under prefers-reduced-motion: mouth
 * only, no nod.
 *
 * Friendly and deliberate, not photoreal - chosen because it is free, adds zero
 * latency, and sidesteps the uncanny valley. Ref: PRD > Product Decisions.
 *
 * Cut order: degrades to a state-only avatar (no lip-flap) before the kernel is
 * touched.
 */

export interface AvatarProps {
  state: "idle" | "listening" | "thinking" | "speaking";
  /** 0..1 mouth openness. */
  mouth: number;
}

export function Avatar({ state, mouth }: AvatarProps) {
  void state;
  void mouth;
  return <svg aria-hidden="true">{/* TODO(slice 4) */}</svg>;
}
