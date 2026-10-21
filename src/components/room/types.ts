/**
 * What the interview room's parts share about the recruiter and the
 * candidate's mic: the 2D panel, the 3D desk mic and the character itself.
 */

import type { VisemeWeights } from "@/lib/voice/lipsync";

export type RecruiterState = "idle" | "listening" | "thinking" | "speaking";

/** The candidate's mic, shown as the panel button and the 3D desk mic. */
export type MicState = "off" | "disabled" | "ready" | "recording";

export interface MicControl {
  state: MicState;
  /** Start recording when ready, send when recording; nothing otherwise. */
  toggle: () => void;
}

/** What drives the face, read every frame without re-rendering React. */
export interface Speaker {
  state: RecruiterState;
  readMouth?: () => number | null;
  readVisemes?: () => VisemeWeights | null;
  /** The candidate's mic, for the 3D desk mic. */
  mic?: MicControl;
  /** A world point to look at instead of the camera; null for eye contact. */
  lookAt?: readonly [number, number, number] | null;
}

/** Recolouring by material name, so one model can play several people. */
export interface Look {
  colors?: Record<string, string>;
  glasses?: boolean;
  /** "rendered" (default): PBR, studio lit, no outline. "toon": flat tones and an outline. */
  style?: "rendered" | "toon";
  /** Glance away now and then instead of constant eye contact (a waiting character). */
  idleGlances?: boolean;
}
