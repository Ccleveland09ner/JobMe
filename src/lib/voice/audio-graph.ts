"use client";

/**
 * The Web Audio graph driving the avatar's mouth. createMediaElementSource works
 * once per element (cached); the graph must connect to destination or the page
 * goes silent; the context only resumes in a user gesture.
 */

import { prefersReducedMotion } from "../frontend/motion";

import { getSharedAudio } from "./tts";

export interface AudioGraph {
  /** 0..1, smoothed. Feed straight to the avatar's `mouth` prop. */
  readMouth: () => number;
  /** Browser speech synthesis exposes no stream; this drives a sine instead. */
  setSyntheticSpeaking: (speaking: boolean) => void;
  resume: () => Promise<void>;
  dispose: () => void;
}

let context: AudioContext | null = null;
const sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

/** Call from the Begin click handler, once per session. */
export function createAudioGraph(
  element: HTMLAudioElement = getSharedAudio(),
): AudioGraph {
  const Ctor =
    typeof window !== "undefined"
      ? window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;

  if (!Ctor) {
    // No Web Audio: no lip-sync, everything else works.
    return {
      readMouth: () => 0,
      setSyntheticSpeaking: () => {},
      resume: async () => {},
      dispose: () => {},
    };
  }

  context ??= new Ctor();
  const ctx = context;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;

  let source = sources.get(element);
  if (!source) {
    source = ctx.createMediaElementSource(element);
    sources.set(element, source);
  }
  source.connect(analyser);
  // Not optional — without it the page is silent.
  analyser.connect(ctx.destination);

  const buffer = new Uint8Array(analyser.frequencyBinCount);
  let synthetic = false;
  let smoothed = 0;
  let disposed = false;

  function readMouth(): number {
    if (disposed) return 0;

    let target: number;
    if (synthetic) {
      // The browser voice has no stream to analyse.
      target = 0.35 + 0.3 * Math.abs(Math.sin(performance.now() / 90));
    } else {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buffer.length);
      target = Math.min(1, rms * 4);
    }

    smoothed += (target - smoothed) * 0.35;
    return prefersReducedMotion() ? Math.min(smoothed, 0.5) : smoothed;
  }

  return {
    readMouth,
    setSyntheticSpeaking: (speaking) => {
      synthetic = speaking;
      if (!speaking) smoothed = 0;
    },
    resume: async () => {
      if (ctx.state === "suspended") await ctx.resume();
    },
    dispose: () => {
      disposed = true;
      try {
        source?.disconnect(analyser);
        analyser.disconnect();
      } catch {
        /* already torn down */
      }
    },
  };
}
