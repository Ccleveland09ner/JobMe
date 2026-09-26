/**
 * Speech input. Browser-only - Web Speech API, Chrome/Edge.
 *
 * TODO(slice 3): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > Speech Input
 *
 * Config: continuous: true, interimResults: true, lang: 'en-US'.
 *
 * IMPORTANT: Chrome ends recognition on its own after a silence. The wrapper
 * must AUTO-RESTART while the talk key is still held and concatenate the
 * finals, otherwise long answers get truncated mid-sentence.
 *
 * Privacy note owed to the user: Chrome streams the audio to Google's servers
 * for recognition. We never upload or store it ourselves.
 * Ref: docs/TechDesign-JobMe-MVP.md > External Services
 */

export interface SttHandle {
  stop: () => Promise<{ transcript: string; durationMs: number }>;
}

/** True when this browser can do speech recognition at all. */
export function isSttSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
}

export function start(
  onInterim: (text: string) => void,
  onFinal: (text: string) => void,
): SttHandle {
  void onInterim;
  void onFinal;
  throw new Error("TODO(slice 3): stt.start not implemented");
}
