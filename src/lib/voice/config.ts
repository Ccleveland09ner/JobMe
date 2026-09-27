/**
 * Shared voice configuration, in one place so the dev page, the route and the
 * interview room cannot drift apart while any of them is being tuned.
 */

export const TTS_MODEL_ID = "eleven_flash_v2_5";

/**
 * Lower bitrate reaches a playable buffer sooner — Safari will not start
 * playback until roughly 1024 bytes have arrived, and at 128kbps that is
 * meaningfully later than at 32kbps. Quality is ample for speech.
 */
export const TTS_OUTPUT_FORMAT = "mp3_22050_32";

/** Give up waiting for the first byte and fall back to the browser voice. */
export const TTS_FIRST_BYTE_TIMEOUT_MS = 1200;

/**
 * Give up waiting for audible sound.
 *
 * The scaffold's single 4000ms stall threshold exceeded the entire 2.5s
 * submit-to-audio budget, so a stalled request would have burned the whole
 * budget before the fallback even started speaking.
 */
export const TTS_FIRST_SOUND_TIMEOUT_MS = 2500;

/** Static acknowledgement clips, played the instant an answer is submitted. */
export const ACK_CLIP_PATH = "/audio/ack";
export const ACK_CLIP_COUNT = 10;

/**
 * A longer bed played after the ack while the turn is still in flight.
 *
 * The highest-leverage latency item in the product: it converts several
 * seconds of dead air into a recruiter thinking out loud, for the price of one
 * pre-generated file.
 */
export const FILLER_CLIP_PATH = "/audio/filler";
export const FILLER_CLIP_COUNT = 4;
