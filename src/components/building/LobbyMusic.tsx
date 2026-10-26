"use client";

/**
 * Plays the lobby's music (music.ts) quietly while the user is in the
 * lobby: it fades in as they walk in and out as they leave. It stays quiet
 * when turned off on the settings board, while something holds a hush (the
 * microphone test) and while the tab is hidden. Browsers only let sound start
 * after a click or a key press, so a start they refuse waits for one.
 */

import { useEffect, useSyncExternalStore } from "react";

import { useLobbyMusic } from "@/lib/frontend/preferences";

import { useBuilding } from "./BuildingProvider";
import { LOBBY_TRACKS, LOBBY_VOLUME, nextTrack, useMusicHushed, wantsLobbyMusic } from "./music";

const FADE_SECONDS = 1.5;

/** One player for the page, kept across routes; LobbyMusic says when it is wanted. */
class MusicPlayer {
  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  /** The volume, through Web Audio where it exists: iOS ignores an element's own volume. */
  private gain: GainNode | null = null;
  private track = Math.floor(Math.random() * LOBBY_TRACKS.length);
  private wanted = false;
  /** Tracks in a row that would not load; at the playlist's length, it stays quiet. */
  private failures = 0;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private waiting = false;

  want(wanted: boolean) {
    if (wanted === this.wanted) return;
    this.wanted = wanted;
    if (wanted) this.start();
    else this.stop();
  }

  private start() {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
    if (this.failures >= LOBBY_TRACKS.length) return;
    // No click or key press yet: no sound can start until there is one.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return this.waitForGesture();
    const audio = this.element();
    this.connect(audio);
    void this.context?.resume().catch(() => {});
    audio.play().then(
      () => {
        if (!this.wanted) return;
        this.fadeTo(LOBBY_VOLUME);
        // Playing into a graph that hasn't started: it starts on the next gesture.
        if (this.context && this.context.state !== "running") this.waitForGesture();
      },
      (err: unknown) => {
        if ((err as DOMException)?.name === "NotAllowedError") this.waitForGesture();
      },
    );
  }

  private stop() {
    this.fadeTo(0);
    if (this.stopTimer) clearTimeout(this.stopTimer);
    // Paused once it is silent, so a hidden or muted lobby costs nothing.
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;
      if (!this.wanted) this.audio?.pause();
    }, FADE_SECONDS * 1000 + 100);
  }

  private element(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("ended", () => this.advance());
    audio.addEventListener("playing", () => (this.failures = 0));
    audio.addEventListener("error", () => {
      this.failures++;
      if (this.failures < LOBBY_TRACKS.length) this.advance();
    });
    audio.src = LOBBY_TRACKS[this.track].src;
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
    if (!audio) return;
    this.track = nextTrack(this.track, LOBBY_TRACKS.length);
    audio.src = LOBBY_TRACKS[this.track].src;
    if (this.wanted) void audio.play().catch(() => {});
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

let player: MusicPlayer | null = null;
const thePlayer = () => (player ??= new MusicPlayer());

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

export function LobbyMusic() {
  const building = useBuilding();
  const on = useLobbyMusic();
  const hushed = useMusicHushed();
  const visible = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== "hidden",
    () => false,
  );
  const wanted = building !== null && on && !hushed && visible && wantsLobbyMusic(building.state);

  useEffect(() => {
    thePlayer().want(wanted);
  }, [wanted]);
  // Leaving the building's pages: quiet.
  useEffect(() => () => thePlayer().want(false), []);

  return null;
}
