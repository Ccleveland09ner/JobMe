/**
 * The Web Audio graph that drives the avatar's mouth.
 *
 * TODO(slice 4): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > Voice Output, > Look and Feel (Motion)
 *
 * Graph: createMediaElementSource(audio) -> AnalyserNode -> destination.
 * A requestAnimationFrame loop computes smoothed RMS and feeds the `mouth`
 * prop (0..1) on <Avatar>.
 *
 * The AudioContext MUST be created on the Begin click - browsers require a
 * user gesture, and creating it later leaves the avatar mute-faced.
 *
 * Because /api/tts is same-origin, the AnalyserNode can read the stream with
 * no CORS dance. That is the reason for the proxy, not just key hiding.
 *
 * Respect prefers-reduced-motion: mouth only, no nod.
 */

export interface AudioGraph {
  /** 0..1, smoothed RMS of whatever is currently playing. */
  readMouth: () => number;
  dispose: () => void;
}

/** Call this from the Begin click handler, once per session. */
export function createAudioGraph(audio: HTMLAudioElement): AudioGraph {
  void audio;
  throw new Error("TODO(slice 4): createAudioGraph not implemented");
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
