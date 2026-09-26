/**
 * Voice output. Neural voice via the /api/tts proxy, browser voice as the
 * fallback that is always there.
 *
 * TODO(slice 3): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > Voice Output
 *
 * speak(text):
 *   - TTS_PROVIDER=elevenlabs -> point the shared <audio> at
 *     /api/tts?text=<encoded>, play, resolve on 'ended'
 *   - on 'error' OR a 4s stall -> fall back
 *   - fallback: speechSynthesis.speak(new SpeechSynthesisUtterance(text)),
 *     with the mouth driven by a sine oscillation, because an utterance
 *     exposes no audio stream to analyse
 *
 * The interview must never go silent. That constraint outranks voice quality.
 * Ref: docs/PRD-JobMe-MVP.md > Non-Functional Requirements > Reliability
 */

/** Resolves when the line has finished playing, whichever path was used. */
export async function speak(text: string): Promise<void> {
  void text;
  throw new Error("TODO(slice 3): speak not implemented");
}

/**
 * Plays a random pre-generated acknowledgment clip. Must start within ~0.3s of
 * submit - it is what covers the turn latency, so the clips are static MP3s
 * preloaded on room mount, never a live TTS call.
 * Ref: docs/TechDesign-JobMe-MVP.md > Latency Plan
 */
export function playAck(): void {
  throw new Error("TODO(slice 3): playAck not implemented");
}

export const ACK_CLIP_COUNT = 10;
export const ACK_CLIP_PATH = "/audio/ack";
export const TTS_STALL_MS = 4000;
