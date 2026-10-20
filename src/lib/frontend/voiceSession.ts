/**
 * Page-lifetime audio setup for the interview, shared across client
 * navigations (setup -> room is a client-side push, so this module's state
 * survives it).
 *
 * `unlockAudio()` MUST be called from a click handler. Browsers start an
 * AudioContext suspended and only resume it inside a user gesture, and the
 * shared <audio> element is routed through that context once the graph
 * exists — creating it outside a gesture would silence the recruiter
 * entirely (see lib/voice/audio-graph.ts, hazards 2 and 3). Called on Begin
 * (setup), on Resume (dashboard) and on the room's own buttons.
 *
 * Without a graph (e.g. a hard reload straight into the room) everything
 * still works: the avatar's mouth falls back to a gentle synthetic motion.
 */

import { createAudioGraph, type AudioGraph } from "../voice/audio-graph";
import { openness, type VisemeWeights } from "../voice/lipsync";
import { preloadClips, speechFrame } from "../voice/tts";

let graph: AudioGraph | null = null;

export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  try {
    preloadClips();
    graph ??= createAudioGraph();
    void graph.resume();
  } catch {
    // No Web Audio: no lip-sync, the interview is unaffected.
  }
}

/**
 * 0..1 mouth openness. From the lip-sync timeline when a line is being
 * spoken (it knows the words), else from the voice's loudness, else null.
 */
export function readMouth(): number | null {
  const frame = speechFrame();
  if (frame) return openness(frame.weights);
  return graph ? graph.readMouth() : null;
}

/**
 * The mouth shapes for this frame, from the lip-sync timeline (see
 * lib/voice/lipsync.ts); null when nothing is being spoken with one.
 */
export function readVisemes(): VisemeWeights | null {
  return speechFrame()?.weights ?? null;
}

/** The word being spoken in `text` right now, as [start, end) offsets; null if `text` is not what is being spoken. */
export function readSpokenWord(text: string): { charStart: number; charEnd: number } | null {
  const frame = speechFrame();
  return frame && frame.text === text.trim() ? frame.word : null;
}

/** Browser speech synthesis exposes no stream; animate the mouth instead. */
export function setSyntheticSpeaking(speaking: boolean): void {
  graph?.setSyntheticSpeaking(speaking);
}
