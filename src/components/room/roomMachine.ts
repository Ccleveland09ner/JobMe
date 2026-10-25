/**
 * The interview room's UI phase machine (a pure reducer).
 *
 *   speaking -> awaitingAnswer -> recording -> submitting -> speaking ... -> done
 *
 * The mic is disabled while the interviewer speaks; an answer is sent on Send
 * or after IDLE_SEND_MS of silence. It sequences the screen, never the
 * interview: nothing here branches on scores.
 *
 * A fresh interview opens with a greeting the candidate answers through the
 * same phases; that answer goes nowhere (GREETED), then question 1 is asked.
 */

import type { InputMode, NoteView, ProgressView, QuestionView } from "@/lib/frontend/types";

import type { MicState, RecruiterState } from "./types";

/** Silence after the last recognised word before a voice answer is sent. */
export const IDLE_SEND_MS = 10_000;

/** How much of the idle window shows a visible "Sending in N…" cue. */
export const IDLE_WARN_MS = 3_000;

export type Phase =
  /** The interviewer is talking. The mic is disabled. */
  | "speaking"
  /** The candidate's turn: mic enabled (voice) or text box enabled (typed). */
  | "awaitingAnswer"
  /** Voice only: the recognizer is capturing. */
  | "recording"
  | "submitting"
  /** A stale submit was refused; the page is reloading the server's state. */
  | "resyncing"
  | "done";

export interface RoomState {
  phase: Phase;
  inputMode: InputMode;
  question: QuestionView;
  /** Lines to say on entering `speaking`, in order. */
  speech: string[];
  /** The line from setup that leads into the first question, shown above it. */
  intro: string | null;
  /**
   * The recruiter's greeting, while it waits for the candidate's reply. That
   * reply is answered in the room (GREETED) and never sent as a turn; `intro`
   * is what follows it.
   */
  greeting: { line: string; intro: string } | null;
  /** Answered turns. The next submit sends `turnSeq + 1`. */
  turnSeq: number;
  progress: ProgressView;
  /** Oldest first. */
  notes: NoteView[];
  /** The typed answer, or the live voice transcript. */
  draft: string;
  /** Recruiter's "say a bit more" line, shown until the next submit. */
  nudge: string | null;
  /** Neutral guidance, e.g. "We didn't hear anything". */
  notice: string | null;
  /** A friendly, already-sanitised error message. */
  error: string | null;
  wrapLine: string | null;
}

export type RoomEvent =
  /** The opening from setup; with a greeting, the candidate answers it before the first question. */
  | { type: "INTRO"; line: string; greeting?: string | null }
  /** The candidate answered the greeting; `reply` is the recruiter's answer to them. */
  | { type: "GREETED"; reply: string }
  | { type: "SPEECH_DONE" }
  | { type: "DRAFT_CHANGED"; text: string }
  | { type: "RECORD_START" }
  | { type: "LIVE_TEXT"; text: string }
  /** Recording ended without an answer to send (nothing was heard). */
  | { type: "RECORD_CANCEL"; notice: string | null }
  | { type: "SUBMIT" }
  | { type: "NUDGE"; line: string }
  | {
      type: "TURN_OK";
      note: NoteView;
      next: QuestionView | null;
      done: boolean;
      wrapLine: string | null;
      progress: ProgressView;
    }
  | { type: "SUBMIT_FAILED"; message: string }
  | { type: "STALE" }
  /** Voice became unusable (no support, mic lost): continue typed. */
  | { type: "FALLBACK_TO_TYPED"; notice: string; draft?: string }
  | { type: "END" };

export function initRoom(input: {
  question: QuestionView;
  turnSeq: number;
  progress: ProgressView;
  notes: NoteView[];
  inputMode: InputMode;
}): RoomState {
  return {
    phase: "speaking",
    inputMode: input.inputMode,
    question: input.question,
    speech: spokenQuestion(input.question),
    intro: null,
    greeting: null,
    turnSeq: input.turnSeq,
    progress: input.progress,
    notes: input.notes,
    draft: "",
    nudge: null,
    notice: null,
    error: null,
    wrapLine: null,
  };
}

function spokenQuestion(q: QuestionView): string[] {
  return q.lead ? [q.lead, q.text] : [q.text];
}

export function roomReducer(state: RoomState, event: RoomEvent): RoomState {
  switch (event.type) {
    case "INTRO":
      // Only before the first answer.
      if (state.turnSeq > 0 || state.phase !== "speaking" || state.greeting) return state;
      if (event.greeting) {
        return { ...state, greeting: { line: event.greeting, intro: event.line }, speech: [event.greeting] };
      }
      return { ...state, intro: event.line, speech: [event.line, ...state.speech] };

    case "GREETED": {
      if (state.phase !== "submitting" || !state.greeting) return state;
      const intro = `${event.reply} ${state.greeting.intro}`.trim();
      return {
        ...state,
        phase: "speaking",
        greeting: null,
        intro,
        speech: [intro, ...spokenQuestion(state.question)],
        draft: "",
      };
    }

    case "SPEECH_DONE":
      if (state.phase !== "speaking") return state;
      return { ...state, phase: "awaitingAnswer", speech: [] };

    case "DRAFT_CHANGED":
      if (state.inputMode !== "typed" || state.phase !== "awaitingAnswer") return state;
      return { ...state, draft: event.text };

    case "RECORD_START":
      // The guard that stops recording over the interviewer.
      if (state.inputMode !== "voice" || state.phase !== "awaitingAnswer") return state;
      return { ...state, phase: "recording", draft: "", error: null, notice: null };

    case "LIVE_TEXT":
      if (state.phase !== "recording") return state;
      return { ...state, draft: event.text };

    case "RECORD_CANCEL":
      if (state.phase !== "recording" && state.phase !== "submitting") return state;
      return { ...state, phase: "awaitingAnswer", draft: "", notice: event.notice };

    case "SUBMIT":
      // Recording: the transcript is collected on the way out. Otherwise: the draft.
      if (state.phase === "recording") {
        return { ...state, phase: "submitting", error: null, notice: null };
      }
      if (state.phase !== "awaitingAnswer" || !state.draft.trim()) return state;
      return { ...state, phase: "submitting", error: null, notice: null };

    case "NUDGE":
      // Not scored: the question stands. A typed draft is kept; voice re-records.
      if (state.phase !== "submitting") return state;
      return {
        ...state,
        phase: "speaking",
        nudge: event.line,
        speech: [event.line],
        draft: state.inputMode === "typed" ? state.draft : "",
      };

    case "TURN_OK": {
      if (state.phase !== "submitting") return state;
      const base = {
        ...state,
        turnSeq: state.turnSeq + 1,
        notes: [...state.notes, event.note],
        progress: { ...state.progress, ...event.progress },
        draft: "",
        nudge: null,
        notice: null,
        error: null,
        intro: null,
      };
      if (event.done || !event.next) {
        return {
          ...base,
          phase: "done",
          wrapLine: event.wrapLine,
          speech: event.wrapLine ? [event.wrapLine] : [],
        };
      }
      return { ...base, phase: "speaking", question: event.next, speech: spokenQuestion(event.next) };
    }

    case "SUBMIT_FAILED":
      // Keep the draft so it can be sent again.
      if (state.phase !== "submitting") return state;
      return { ...state, phase: "awaitingAnswer", error: event.message };

    case "STALE":
      if (state.phase !== "submitting") return state;
      return { ...state, phase: "resyncing" };

    case "FALLBACK_TO_TYPED": {
      if (state.inputMode === "typed") return state;
      if (state.phase === "submitting" || state.phase === "resyncing" || state.phase === "done") return state;
      return {
        ...state,
        inputMode: "typed",
        phase: state.phase === "recording" ? "awaitingAnswer" : state.phase,
        draft: event.draft ?? state.draft,
        notice: event.notice,
      };
    }

    case "END":
      if (state.phase === "submitting" || state.phase === "done") return state;
      return { ...state, phase: "done", speech: [] };
  }
}

/** The candidate's mic, as both the panel button and the 3D desk mic show it. */
export function micStateFor(inputMode: InputMode, phase: Phase): MicState {
  if (inputMode !== "voice") return "off";
  if (phase === "recording") return "recording";
  return phase === "awaitingAnswer" ? "ready" : "disabled";
}

/** The avatar's state for a phase. Presentation only. */
export function avatarState(phase: Phase): RecruiterState {
  switch (phase) {
    case "speaking":
      return "speaking";
    case "recording":
      return "listening";
    case "submitting":
    case "resyncing":
      return "thinking";
    default:
      return "idle";
  }
}

/** The idle window's state; `secondsLeft` is set only during the final warning. */
export function idleStatus(
  now: number,
  lastActivityAt: number,
  sendAfterMs = IDLE_SEND_MS,
  warnMs = IDLE_WARN_MS,
): { expired: boolean; secondsLeft: number | null } {
  const remaining = sendAfterMs - (now - lastActivityAt);
  if (remaining <= 0) return { expired: true, secondsLeft: 0 };
  return { expired: false, secondsLeft: remaining <= warnMs ? Math.ceil(remaining / 1000) : null };
}
