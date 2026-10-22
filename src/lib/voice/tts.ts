"use client";

/**
 * The recruiter's voice: neural via /api/tts, with browser synthesis as the
 * fallback, so the interview never goes silent. Either path publishes a
 * lip-sync timeline, read each frame through speechFrame().
 */

import {
  ACK_CLIP_COUNT,
  ACK_CLIP_PATH,
  FILLER_CLIP_COUNT,
  FILLER_CLIP_PATH,
  TTS_ALIGNED_TIMEOUT_MS,
  TTS_FIRST_SOUND_TIMEOUT_MS,
} from "./config";
import {
  alignedTimeline,
  estimatedTimeline,
  sampleVisemes,
  wordAt,
  wordAtChar,
  type SpeechTimeline,
  type VisemeWeights,
} from "./lipsync";

// The live speech timeline

interface LiveSpeech {
  timeline: SpeechTimeline;
  /** Seconds into the timeline right now; negative before sound starts. */
  now: () => number;
}

let live: LiveSpeech | null = null;

/** What the speaker's mouth and the captions should show this frame. */
export interface SpeechFrame {
  /** The exact text being spoken, so captions can tell it is their line. */
  text: string;
  weights: VisemeWeights;
  /** The word being spoken, as [start, end) offsets into `text`; null between words. */
  word: { charStart: number; charEnd: number } | null;
}

/** Null when nothing is being spoken. Cheap enough to call every frame. */
export function speechFrame(): SpeechFrame | null {
  if (!live) return null;
  const t = live.now();
  const { timeline } = live;
  const i = t < 0 ? null : wordAt(timeline, t);
  const w = i === null ? null : timeline.words[i];
  return {
    text: timeline.text,
    weights: t < 0 ? {} : sampleVisemes(timeline, t),
    word: w ? { charStart: w.charStart, charEnd: w.charEnd } : null,
  };
}

/** The browser voice's speaking rate (letters per second), learned from each line. */
let browserCharsPerSecond = 14;

function letters(text: string): number {
  return (text.match(/[A-Za-z0-9]/g) ?? []).length;
}

/** Bumped when playback is superseded, so a late neural response stays silent. */
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

/** Chrome's getVoices() starts empty: await voiceschanged once. */
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

  // Probe first, so a 503 or a stall costs only the first-byte timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TTS_ALIGNED_TIMEOUT_MS);
  options.signal?.addEventListener("abort", () => controller.abort());

  let response: Response;
  try {
    // `align=1`: the audio comes with every character's time, for lip-sync.
    response = await fetch(`/api/tts?align=1&text=${encodeURIComponent(text)}`, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    options.onFallback?.(`tts ${response.status}`);
    return false;
  }

  // JSON when aligned ({ audio: base64 mp3, alignment }), plain audio otherwise.
  let blob: Blob;
  let timeline: SpeechTimeline | null = null;
  if ((response.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await response.json()) as {
      audio: string;
      alignment?: {
        characters: string[];
        character_start_times_seconds: number[];
        character_end_times_seconds: number[];
      } | null;
    };
    const bytes = Uint8Array.from(atob(body.audio), (c) => c.charCodeAt(0));
    blob = new Blob([bytes], { type: "audio/mpeg" });
    const a = body.alignment;
    if (a) timeline = alignedTimeline(text, a.characters, a.character_start_times_seconds, a.character_end_times_seconds);
  } else {
    blob = await response.blob();
  }
  if (epoch !== playbackEpoch) return true; // superseded; stay silent

  const url = URL.createObjectURL(blob);
  audio.src = url;
  // The mouth runs on the audio's own clock: exact, whatever the buffering.
  const entry: LiveSpeech | null = timeline ? { timeline, now: () => audio.currentTime } : null;

  return new Promise<boolean>((resolve) => {
    const cleanup = () => {
      URL.revokeObjectURL(url);
      audio.onended = null;
      audio.onerror = null;
      audio.onplaying = null;
      if (live === entry) live = null;
    };
    audio.onplaying = () => {
      if (entry && epoch === playbackEpoch) live = entry;
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
    // Nothing can speak; the captions carry it.
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

    // Lip-sync: estimated at the learned rate, pinned to each announced word.
    const timeline = estimatedTimeline(text, browserCharsPerSecond);
    let startedAt = -1;
    let anchorReal = -1; // performance.now() at the last anchor
    let anchorAt = 0; // timeline seconds at the last anchor
    let wordEnd = Infinity; // where the anchored word ends on the timeline
    let wordEvents = false;
    const entry: LiveSpeech = {
      timeline,
      now: () => {
        if (anchorReal < 0) return -1;
        const t = anchorAt + (performance.now() - anchorReal) / 1000;
        // Never run past the current word: if the next is late, the mouth settles.
        return wordEvents ? Math.min(t, wordEnd + 0.12) : t;
      },
    };

    const finish = () => {
      if (live === entry) live = null;
      if (startedAt >= 0) {
        // Learn this voice's rate from how long the line really took.
        const actual = (performance.now() - startedAt) / 1000;
        if (actual > 0.5 && letters(text) >= 8) {
          const learned = browserCharsPerSecond * (timeline.duration / actual);
          browserCharsPerSecond = Math.min(24, Math.max(8, browserCharsPerSecond * 0.5 + learned * 0.5));
        }
      }
      resolve();
    };

    utterance.onstart = () => {
      if (epoch !== playbackEpoch) return;
      startedAt = anchorReal = performance.now();
      anchorAt = 0;
      live = entry;
    };
    utterance.onboundary = (event) => {
      if (event.name && event.name !== "word") return;
      const i = wordAtChar(timeline, event.charIndex);
      if (i === null) return;
      wordEvents = true;
      anchorReal = performance.now();
      anchorAt = timeline.words[i].start;
      wordEnd = timeline.words[i].end;
    };
    utterance.onend = finish;
    utterance.onerror = () => {
      if (live === entry) live = null;
      resolve();
    };
    options.signal?.addEventListener("abort", () => {
      window.speechSynthesis.cancel();
      if (live === entry) live = null;
      resolve();
    });
    window.speechSynthesis.speak(utterance);
  });
}

/** Cancels anything currently speaking and invalidates in-flight requests. */
export function stopSpeaking(): void {
  playbackEpoch++;
  live = null;
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

/** Must run on the Begin click: the first play() unlocks audio. */
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

/** Within ~0.3s of submit — this is what covers the turn's latency. */
export function playAck(): void {
  playRandom(ackPool);
}

/** A longer bed for when the turn is still in flight after the ack. */
export function playFiller(): void {
  playRandom(fillerPool);
}
