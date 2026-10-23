/**
 * Page-lifetime audio for the interview. unlockAudio() must run in a click
 * handler (browsers only resume audio in a user gesture). Without a graph the
 * mouth falls back to synthetic motion.
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

/** 0..1 mouth openness: from the lip-sync timeline, else loudness, else null. */
export function readMouth(): number | null {
  const frame = speechFrame();
  if (frame) return openness(frame.weights);
  return graph ? graph.readMouth() : null;
}

/** This frame's mouth shapes from the lip-sync timeline; null without one. */
export function readVisemes(): VisemeWeights | null {
  return speechFrame()?.weights ?? null;
}

/** The word being spoken in `text`, as [start, end) offsets; null if it isn't being spoken. */
export function readSpokenWord(text: string): { charStart: number; charEnd: number } | null {
  const frame = speechFrame();
  return frame && frame.text === text.trim() ? frame.word : null;
}
