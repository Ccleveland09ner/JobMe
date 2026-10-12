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
import { preloadClips } from "../voice/tts";

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

/** 0..1 mouth openness from the live voice, or null when there is no graph. */
export function readMouth(): number | null {
  return graph ? graph.readMouth() : null;
}

/** Browser speech synthesis exposes no stream; animate the mouth instead. */
export function setSyntheticSpeaking(speaking: boolean): void {
  graph?.setSyntheticSpeaking(speaking);
}
