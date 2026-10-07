/**
 * The interview room's UI phase machine. A pure reducer, so every transition
 * is unit-tested without a browser (roomMachine.test.ts).
 *
 *   speaking -> awaitingAnswer -> recording -> submitting -> speaking ... -> done
 *
 * The answer flow (user decision, 2026-10-07):
 *   - While the interviewer speaks the mic is DISABLED — the candidate cannot
 *     start recording over the question.
 *   - When the interviewer finishes, the mic is enabled; the candidate taps
 *     Start answering to record.
 *   - The answer is sent when they press Send, or automatically after
 *     IDLE_SEND_MS without a new word. No review step: once sent, it goes
 *     straight to the interviewer, as in a real interview.
 * Typed mode is the same loop with a text box: type, then Send.
 *
 * It sequences the SCREEN, never the interview. Whether an answer was weak,
 * what the next move is, when to wrap — all of that arrives in the turn
 * response and is applied here verbatim. There is no branch on band, gap or
 * move anywhere in this file, and there must never be.
 *
 * `speech` is the queue of lines the recruiter says on entering `speaking`
 * (intro, transition lead, question, nudge). The room plays it, then sends
 * SPEECH_DONE.
 */

import type { InputMode, NoteView, ProgressView, QuestionView } from "@/lib/frontend/types";

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
  /** The greeting from setup, shown above the first question. */
  intro: string | null;
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
  | { type: "INTRO"; line: string }
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
      // Only meaningful before the first answer; a refresh mid-interview has
      // no greeting to repeat.
      if (state.turnSeq > 0 || state.phase !== "speaking") return state;
      return { ...state, intro: event.line, speech: [event.line, ...state.speech] };

    case "SPEECH_DONE":
      if (state.phase !== "speaking") return state;
      return { ...state, phase: "awaitingAnswer", speech: [] };

    case "DRAFT_CHANGED":
      if (state.inputMode !== "typed" || state.phase !== "awaitingAnswer") return state;
      return { ...state, draft: event.text };

    case "RECORD_START":
      // The mic is disabled unless it is the candidate's turn — this guard is
      // what stops recording over the interviewer.
      if (state.inputMode !== "voice" || state.phase !== "awaitingAnswer") return state;
      return { ...state, phase: "recording", draft: "", error: null, notice: null };

    case "LIVE_TEXT":
      if (state.phase !== "recording") return state;
      return { ...state, draft: event.text };

    case "RECORD_CANCEL":
      if (state.phase !== "recording" && state.phase !== "submitting") return state;
      return { ...state, phase: "awaitingAnswer", draft: "", notice: event.notice };

    case "SUBMIT":
      // Voice: Send (or the idle timer) while recording; the final transcript
      // is collected on the way out. Typed, or a voice retry after a failed
      // send: whatever is in the draft.
      if (state.phase === "recording") {
        return { ...state, phase: "submitting", error: null, notice: null };
      }
      if (state.phase !== "awaitingAnswer" || !state.draft.trim()) return state;
      return { ...state, phase: "submitting", error: null, notice: null };

    case "NUDGE":
      // Not scored, not counted: the same question stands. A typed draft is
      // kept to build on; a voice answer is re-recorded from scratch.
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
      // The draft (typed text or the voice transcript) is kept so the
      // candidate can send it again without re-answering.
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

/** The avatar's state for a phase. Presentation only. */
export function avatarState(phase: Phase): "idle" | "listening" | "thinking" | "speaking" {
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

/**
 * Where the idle window stands, from the time of the last recognised word.
 * `secondsLeft` is set only inside the warning window, so the UI shows a
 * countdown for the last few seconds and nothing before.
 */
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
