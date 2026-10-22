/** Voice settings shared by the TTS route, the dev page and the room. */

export const TTS_MODEL_ID = "eleven_flash_v2_5";

/** Low bitrate reaches a playable buffer sooner (Safari waits for ~1 KB). */
export const TTS_OUTPUT_FORMAT = "mp3_22050_32";

/** Give up waiting for the first byte and fall back to the browser voice. */
export const TTS_FIRST_BYTE_TIMEOUT_MS = 1200;

/** Give up waiting for sound, within the 2.5 s submit-to-audio budget. */
export const TTS_FIRST_SOUND_TIMEOUT_MS = 2500;

/** Static acknowledgement clips, played the instant an answer is submitted. */
export const ACK_CLIP_PATH = "/audio/ack";
export const ACK_CLIP_COUNT = 10;

/** Played after the ack while the turn is in flight, so there's no dead air. */
export const FILLER_CLIP_PATH = "/audio/filler";
export const FILLER_CLIP_COUNT = 4;

/** The aligned voice (for lip-sync) arrives whole, so it gets the first-sound budget. */
export const TTS_ALIGNED_TIMEOUT_MS = 2500;
