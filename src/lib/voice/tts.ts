"use client";

/**
 * Voice output: neural voice via the /api/tts proxy, browser speech synthesis
 * as the fallback that is always there.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > Voice Output
 *
 * The governing constraint is that the interview must never go silent. That
 * outranks voice quality, so every path here degrades rather than throws.
 */

import {
  ACK_CLIP_COUNT,
  ACK_CLIP_PATH,
  FILLER_CLIP_COUNT,
  FILLER_CLIP_PATH,
  TTS_FIRST_BYTE_TIMEOUT_MS,
  TTS_FIRST_SOUND_TIMEOUT_MS,
} from "./config";

/**
 * Incremented every time playback is superseded.
 *
 * Without it, a slow neural request that arrives at 6s — long after the
 * fallback started speaking — plays over the top and the recruiter says the
 * question twice, simultaneously.
 */
let playbackEpoch = 0;

let sharedAudio: HTMLAudioElement | null = null;
let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

/** The one `<audio>` element, so the analyser only ever wires up once. */
export function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "auto";
  }
  return sharedAudio;
}

/**
 * `getVoices()` returns an empty array on first call in Chrome; the list
 * arrives asynchronously via `voiceschanged`. Awaiting it once at startup
 * avoids a first question that is silently spoken by nothing.
 */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve([]);
      return;
    }
    const existing = window.speechSynthesis.getVoices();
    if (existing.length) {
      resolve(existing);
      return;
    }
    const timeout = setTimeout(
      () => resolve(window.speechSynthesis.getVoices()),
      1000,
    );
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        clearTimeout(timeout);
        resolve(window.speechSynthesis.getVoices());
      },
      { once: true },
    );
  });
  return voicesReady;
}

export interface SpeakOptions {
  /** Abort playback, e.g. when the candidate ends the interview early. */
  signal?: AbortSignal;
  onFallback?: (reason: string) => void;
}

/** Resolves when the line has finished, whichever path produced the sound. */
export async function speak(
  text: string,
  options: SpeakOptions = {},
): Promise<void> {
  const epoch = ++playbackEpoch;
  const clean = text.trim();
  if (!clean) return;

  try {
    const played = await playNeural(clean, epoch, options);
    if (played) return;
  } catch (err) {
    options.onFallback?.((err as Error).message);
  }

  if (epoch !== playbackEpoch) return;
  await playBrowser(clean, epoch, options);
}

async function playNeural(
  text: string,
  epoch: number,
  options: SpeakOptions,
): Promise<boolean> {
  const audio = getSharedAudio();

  // Probe the route first so a 503 (browser-voice mode) or a stall costs the
  // first-byte timeout rather than the whole audio budget.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TTS_FIRST_BYTE_TIMEOUT_MS);
  options.signal?.addEventListener("abort", () => controller.abort());

  let response: Response;
  try {
    response = await fetch(`/api/tts?text=${encodeURIComponent(text)}`, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    options.onFallback?.(`tts ${response.status}`);
    return false;
  }

  const blob = await response.blob();
  if (epoch !== playbackEpoch) return true; // superseded; stay silent

  const url = URL.createObjectURL(blob);
  audio.src = url;

  return new Promise<boolean>((resolve) => {
    const cleanup = () => {
      URL.revokeObjectURL(url);
      audio.onended = null;
      audio.onerror = null;
    };

    const soundTimer = setTimeout(() => {
      if (audio.currentTime === 0) {
        cleanup();
        options.onFallback?.("no audible sound");
        resolve(false);
      }
    }, TTS_FIRST_SOUND_TIMEOUT_MS);

    audio.onended = () => {
      clearTimeout(soundTimer);
      cleanup();
      resolve(true);
    };
    audio.onerror = () => {
      clearTimeout(soundTimer);
      cleanup();
      options.onFallback?.("audio element error");
      resolve(false);
    };

    void audio.play().catch(() => {
      clearTimeout(soundTimer);
      cleanup();
      resolve(false);
    });
  });
}

async function playBrowser(
  text: string,
  epoch: number,
  options: SpeakOptions,
): Promise<void> {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  const voices = await loadVoices();
  if (!voices.length) {
    // Nothing can speak. Captions carry the question; that is why they are
    // always on rather than a setting.
    options.onFallback?.("no voices available");
    return;
  }
  if (epoch !== playbackEpoch) return;

  await new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const preferred = voices.find(
      (v) => v.lang.startsWith("en") && /natural|google|samantha/i.test(v.name),
    );
    utterance.voice = preferred ?? voices.find((v) => v.lang.startsWith("en")) ?? voices[0];
    utterance.rate = 1.0;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    options.signal?.addEventListener("abort", () => {
      window.speechSynthesis.cancel();
      resolve();
    });
    window.speechSynthesis.speak(utterance);
  });
}

/** Cancels anything currently speaking and invalidates in-flight requests. */
export function stopSpeaking(): void {
  playbackEpoch++;
  if (sharedAudio) {
    sharedAudio.pause();
    sharedAudio.currentTime = 0;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

const ackPool: HTMLAudioElement[] = [];
const fillerPool: HTMLAudioElement[] = [];

/**
 * Preloads the static clips. Must run on the Begin click: the first `play()`
 * also unlocks audio, and if that happens at submit time the 0.3s ack target
 * is unreachable.
 */
export function preloadClips(): void {
  if (typeof window === "undefined") return;
  const fill = (pool: HTMLAudioElement[], path: string, count: number) => {
    if (pool.length) return;
    for (let i = 1; i <= count; i++) {
      const audio = new Audio(
        `${path}/${path.includes("ack") ? "ack" : "filler"}-${String(i).padStart(2, "0")}.mp3`,
      );
      audio.preload = "auto";
      pool.push(audio);
    }
  };
  fill(ackPool, ACK_CLIP_PATH, ACK_CLIP_COUNT);
  fill(fillerPool, FILLER_CLIP_PATH, FILLER_CLIP_COUNT);
}

function playRandom(pool: HTMLAudioElement[]): HTMLAudioElement | null {
  const ready = pool.filter((a) => a.readyState >= 2);
  const candidates = ready.length ? ready : pool;
  const clip = candidates[Math.floor(Math.random() * candidates.length)];
  if (!clip) return null;
  clip.currentTime = 0;
  void clip.play().catch(() => {});
  return clip;
}

/** Plays within ~0.3s of submit. This is what covers the turn's latency. */
export function playAck(): void {
  playRandom(ackPool);
}

/** A longer bed for when the turn is still in flight after the ack. */
export function playFiller(): void {
  playRandom(fillerPool);
}
