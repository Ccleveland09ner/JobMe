/** One place, so the route, the dev page and the room cannot drift apart. */

export const TTS_MODEL_ID = "eleven_flash_v2_5";

/**
 * Lower bitrate reaches a playable buffer sooner: Safari waits for ~1024 bytes,
 * which arrives much later at 128kbps. Ample quality for speech.
 */
export const TTS_OUTPUT_FORMAT = "mp3_22050_32";

/** Give up waiting for the first byte and fall back to the browser voice. */
export const TTS_FIRST_BYTE_TIMEOUT_MS = 1200;

/**
 * Give up waiting for sound. A single 4000ms threshold would exceed the whole
 * 2.5s submit-to-audio budget before the fallback even started speaking.
 */
export const TTS_FIRST_SOUND_TIMEOUT_MS = 2500;

/** Static acknowledgement clips, played the instant an answer is submitted. */
export const ACK_CLIP_PATH = "/audio/ack";
export const ACK_CLIP_COUNT = 10;

/**
 * A longer bed after the ack, while the turn is still in flight. The
 * highest-leverage latency item in the product: several seconds of dead air
 * become a recruiter thinking out loud, for one pre-generated file.
 */
export const FILLER_CLIP_PATH = "/audio/filler";
export const FILLER_CLIP_COUNT = 4;
