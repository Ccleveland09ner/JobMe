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
  resume: () => Promise<void>;
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
      resume: async () => {},
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
  let smoothed = 0;

  function readMouth(): number {
    analyser.getByteTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = (buffer[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buffer.length);
    const target = Math.min(1, rms * 4);

    smoothed += (target - smoothed) * 0.35;
    return prefersReducedMotion() ? Math.min(smoothed, 0.5) : smoothed;
  }

  return {
    readMouth,
    resume: async () => {
      if (ctx.state === "suspended") await ctx.resume();
    },
  };
}
