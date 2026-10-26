/**
 * Ms. Crystal's voice: her recorded clips, one `<audio>` element, one line at
 * a time. Every line has a clock (seconds into it) that drives her mouth and
 * the bubble's words: the audio's own clock while it plays, a stand-in at
 * her recorded pace when there's no sound (voice off, autoplay refused, a
 * clip that won't load). Either way the line ends: `done` always settles.
 */

import { stopSpeaking } from "@/lib/voice/tts";
import type { SpeechTimeline } from "@/lib/voice/lipsync";

import type { Line } from "./lines";

/** Wait this long for a clip to be ready before speaking without sound. */
const LOAD_TIMEOUT_MS = 2500;
/** Without sound the words stay up this much longer than the clip, for reading. */
const READING_PAD_S = 0.9;
/** A clip that stalls ends anyway, this long after it should have. */
const STALL_PAD_S = 2.5;
/** Sound that hasn't started by then won't: she carries on silently. */
const START_TIMEOUT_MS = 1200;

export type Spoken = "voiced" | "silent";

export interface Speech {
  /** Seconds into the line; negative before it starts. */
  now: () => number;
  /** Settles when the line has been said (or read), or is stopped. */
  done: Promise<Spoken>;
}

let element: HTMLAudioElement | null = null;
const audio = () => {
  element ??= new Audio();
  element.preload = "auto";
  return element;
};

/** Cuts the current line short, if any. */
let stopCurrent: (() => void) | null = null;

/** Loads the line's clip; true once it can play through, false if it won't in time. */
export function loadClip(line: Line): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const a = audio();
  const url = new URL(line.src, window.location.href).href;
  if (a.src !== url) {
    a.src = url;
    a.load();
  }
  if (a.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) return Promise.resolve(true);
  return new Promise((resolve) => {
    const listeners = new AbortController();
    const finish = (ok: boolean) => {
      listeners.abort();
      clearTimeout(timer);
      resolve(ok);
    };
    a.addEventListener("canplaythrough", () => finish(true), { signal: listeners.signal });
    a.addEventListener("error", () => finish(false), { signal: listeners.signal });
    const timer = setTimeout(() => finish(a.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA), LOAD_TIMEOUT_MS);
  });
}

/**
 * Says the line: with its clip when `voiced` and it will play, else silently
 * at its recorded pace. Stops anything she was saying, and the interviewer.
 */
export function speakLine(line: Line, timeline: SpeechTimeline, voiced: boolean): Speech {
  stopReceptionist();
  // One voice in the building at a time.
  stopSpeaking();

  let startedAt = -1;
  let source: "clip" | "clock" = "clock";
  const a = audio();
  const now = () => (source === "clip" ? a.currentTime : startedAt < 0 ? -1 : (performance.now() - startedAt) / 1000);

  const done = new Promise<Spoken>((resolve) => {
    const listeners = new AbortController();
    const own = { signal: listeners.signal };
    let timer: ReturnType<typeof setTimeout> | null = null;
    let silent = false;
    const settle = (how: Spoken) => {
      if (listeners.signal.aborted) return;
      listeners.abort();
      if (timer) clearTimeout(timer);
      if (stopCurrent === stop) stopCurrent = null;
      resolve(how);
    };
    const stop = () => {
      a.pause();
      settle(source === "clip" ? "voiced" : "silent");
    };
    stopCurrent = stop;
    const endBy = (seconds: number, how: Spoken) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => settle(how), seconds * 1000);
    };

    // No sound: the words and the mouth keep her recorded pace, then the line ends. Once silent, it stays so.
    const silently = () => {
      if (listeners.signal.aborted || silent) return;
      silent = true;
      a.pause();
      source = "clock";
      startedAt = performance.now();
      endBy(timeline.duration + READING_PAD_S, "silent");
    };

    if (!voiced || typeof window === "undefined") return silently();
    a.addEventListener("ended", () => settle("voiced"), own);
    a.addEventListener("error", silently, own);
    // Sound that never starts (play() left hanging) hands over to the clock.
    timer = setTimeout(silently, START_TIMEOUT_MS);
    a.currentTime = 0;
    a.play().then(
      () => {
        if (listeners.signal.aborted) return;
        // Too late: she has already carried on without it.
        if (silent) return void a.pause();
        source = "clip";
        // A stalled clip still ends.
        endBy(timeline.duration + STALL_PAD_S, "voiced");
      },
      // Refused (no click or key press yet) or broken: she speaks silently.
      silently,
    );
  });

  return { now, done };
}

/** Stops her mid-line; its `done` settles. */
export function stopReceptionist(): void {
  stopCurrent?.();
}
