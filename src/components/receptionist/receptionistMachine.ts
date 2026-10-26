/**
 * One thing Ms. Crystal says, from start to finish (pure). Every part of her
 * (voice, mouth, speech bubble, the music's pause) follows these phases:
 *
 *   idle → preparing (music pausing, clip loading)
 *        → speaking  (bubble up, voice and mouth going)
 *        → finishing (voice done, bubble fading out)
 *        → idle      (bubble gone: the music may come back, or the sign-out go on)
 *
 * Only one line at a time: a new one waits for idle. Each carries an id, so a
 * late event from a line that was cut short changes nothing.
 */

import type { Line } from "./lines";

export type Purpose = "greeting" | "goodbye";
export type Phase = "idle" | "preparing" | "speaking" | "finishing";

export interface ReceptionistDialogue {
  phase: Phase;
  /** Bumped by each new line. */
  id: number;
  line: Line | null;
  purpose: Purpose | null;
  /** The line was cut short (the user walked off): the bubble leaves at once. */
  cut: boolean;
}

/** What she is doing, in one word, for the character and anything that asks. */
export type ReceptionistState = "idle" | "preparing" | "greeting" | "goodbye" | "finishing";

export type DialogueEvent =
  | { type: "PREPARE"; line: Line; purpose: Purpose }
  | { type: "SPEAK"; id: number }
  /** The voice finished (or its stand-in timer, when there was no sound). */
  | { type: "SPOKEN"; id: number }
  /** The bubble's exit has finished. */
  | { type: "GONE"; id: number }
  | { type: "CANCEL" };

export const initialDialogue: ReceptionistDialogue = { phase: "idle", id: 0, line: null, purpose: null, cut: false };

export function dialogueReducer(state: ReceptionistDialogue, event: DialogueEvent): ReceptionistDialogue {
  switch (event.type) {
    case "PREPARE":
      if (state.phase !== "idle") return state;
      return { phase: "preparing", id: state.id + 1, line: event.line, purpose: event.purpose, cut: false };
    case "SPEAK":
      return event.id === state.id && state.phase === "preparing" ? { ...state, phase: "speaking" } : state;
    case "SPOKEN":
      return event.id === state.id && state.phase === "speaking" ? { ...state, phase: "finishing" } : state;
    case "GONE":
      return event.id === state.id && state.phase === "finishing" ? { ...initialDialogue, id: state.id } : state;
    case "CANCEL":
      if (state.phase === "idle") return state;
      // Not yet shown: nothing to fade.
      if (state.phase === "preparing") return { ...initialDialogue, id: state.id };
      return { ...state, phase: "finishing", cut: true };
  }
}

export function receptionistState(d: ReceptionistDialogue): ReceptionistState {
  if (d.phase === "speaking") return d.purpose ?? "greeting";
  return d.phase;
}
