/**
 * Quiet background audio for a place in the building (the lobby's music, the
 * street's sounds): a playlist played round and round, faded in and out, and
 * cross-faded when the playlist changes. Browsers only let sound start after
 * a click or a key press, so a start they refuse waits for one.
 */

import { useSyncExternalStore } from "react";

const FADE_SECONDS = 1.5;

const sameList = (a: readonly string[] | null, b: readonly string[] | null) =>
  a === b || (a !== null && b !== null && a.length === b.length && a.every((src, i) => src === b[i]));

export class BackgroundAudio {
  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  /** The volume, through Web Audio where it exists: iOS ignores an element's own volume. */
  private gain: GainNode | null = null;
  /** The playlist asked for; null for silence. */
  private wanted: readonly string[] | null = null;
  /** The playlist in the element, and the track it is on. */
  private loaded: readonly string[] | null = null;
  private index = 0;
  /** Tracks in a row that would not load; at the playlist's length, it stays quiet. */
  private failures = 0;
  /** What happens once a fade out ends: pause, or start the next playlist. */
  private afterFade: ReturnType<typeof setTimeout> | null = null;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private waiting = false;

  constructor(private readonly volume: number) {}

  /** Play these tracks (from a random one, round and round), or fade to silence with null. */
  play(tracks: readonly string[] | null) {
    if (sameList(tracks, this.wanted)) return;
    this.wanted = tracks;
    if (this.afterFade) clearTimeout(this.afterFade);
    this.afterFade = null;
    if (!tracks) return this.fadeOutThen(() => this.audio?.pause());
    // Another playlist while one is heard: fade it out first.
    if (this.audio && !this.audio.paused && !sameList(tracks, this.loaded)) return this.fadeOutThen(() => this.start());
    this.start();
  }

  private fadeOutThen(next: () => void) {
    this.fadeTo(0);
    this.afterFade = setTimeout(() => {
      this.afterFade = null;
      next();
    }, FADE_SECONDS * 1000 + 100);
  }

  private start() {
    const tracks = this.wanted;
    if (!tracks?.length) return;
    // No click or key press yet: no sound can start until there is one.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return this.waitForGesture();
    const audio = this.element();
    if (!sameList(tracks, this.loaded)) {
      this.loaded = tracks;
      this.failures = 0;
      this.index = Math.floor(Math.random() * tracks.length);
      // One track loops seamlessly; more go round, track by track.
      audio.loop = tracks.length === 1;
      audio.src = tracks[this.index];
    }
    if (this.failures >= tracks.length) return;
    this.connect(audio);
    void this.context?.resume().catch(() => {});
    audio.play().then(
      () => {
        if (!sameList(this.wanted, tracks)) return;
        this.fadeTo(this.volume);
        // Playing into a graph that hasn't started: it starts on the next gesture.
        if (this.context && this.context.state !== "running") this.waitForGesture();
      },
      (err: unknown) => {
        if ((err as DOMException)?.name === "NotAllowedError") this.waitForGesture();
      },
    );
  }

  private element(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("ended", () => this.advance());
    audio.addEventListener("playing", () => (this.failures = 0));
    audio.addEventListener("error", () => {
      this.failures++;
      if (this.failures < (this.loaded?.length ?? 0)) this.advance();
    });
    this.audio = audio;
    return audio;
  }

  private connect(audio: HTMLAudioElement) {
    if (this.gain) return;
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    try {
      if (!Context) throw new Error("no Web Audio");
      const context = new Context();
      const gain = context.createGain();
      gain.gain.value = 0;
      context.createMediaElementSource(audio).connect(gain).connect(context.destination);
      this.context = context;
      this.gain = gain;
    } catch {
      // The element's own volume, then (it starts silent and fades in).
      audio.volume = 0;
    }
  }

  private advance() {
    const audio = this.audio;
    const tracks = this.loaded;
    if (!audio || !tracks) return;
    this.index = (this.index + 1) % tracks.length;
    audio.src = tracks[this.index];
    if (sameList(this.wanted, tracks)) void audio.play().catch(() => {});
  }

  private fadeTo(level: number) {
    if (this.gain && this.context) {
      const volume = this.gain.gain;
      const now = this.context.currentTime;
      volume.cancelScheduledValues(now);
      volume.setValueAtTime(volume.value, now);
      volume.linearRampToValueAtTime(level, now + FADE_SECONDS);
      return;
    }
    const audio = this.audio;
    if (!audio) return;
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    const from = audio.volume;
    const steps = 30;
    let step = 0;
    this.fadeTimer = setInterval(() => {
      step++;
      audio.volume = from + (level - from) * (step / steps);
      if (step >= steps && this.fadeTimer) {
        clearInterval(this.fadeTimer);
        this.fadeTimer = null;
      }
    }, (FADE_SECONDS * 1000) / steps);
  }

  /** Try again on the next click or key press. */
  private waitForGesture() {
    if (this.waiting) return;
    this.waiting = true;
    const retry = () => {
      window.removeEventListener("pointerup", retry, true);
      window.removeEventListener("keydown", retry, true);
      this.waiting = false;
      if (this.wanted) this.start();
    };
    window.addEventListener("pointerup", retry, true);
    window.addEventListener("keydown", retry, true);
  }
}

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** False while the tab is hidden (and on the server): background audio rests. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== "hidden",
    () => false,
  );
}
