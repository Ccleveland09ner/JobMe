/**
 * The interview room's UI phase machine. A pure reducer, so every transition
 * is unit-tested without a browser (roomMachine.test.ts).
 *
 *   speaking -> awaitingAnswer -> (recording -> reviewing) -> submitting
 *            -> speaking ... -> done
 *
 * It sequences the SCREEN, never the interview. Whether an answer was weak,
 * what the next move is, when to wrap — all of that arrives in the turn
 * response and is applied here verbatim. There is no branch on band, gap or
 * move anywhere in this file, and there must never be.
 *
 * `speech` is the queue of lines the recruiter says on entering `speaking`
 * (intro, transition lead, question, nudge). The room plays it — today it
 * resolves immediately; TODO(voice) awaits speak() — then sends SPEECH_DONE.
 */

import type { InputMode, NoteView, ProgressView, QuestionView } from "@/lib/frontend/types";

export type Phase =
  | "speaking"
  | "awaitingAnswer"
  | "recording"
  | "reviewing"
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
  /** The answer being composed (typed) or reviewed (voice). */
  draft: string;
  /** Recruiter's "say a bit more" line, shown until the next submit. */
  nudge: string | null;
  /** A friendly, already-sanitised error message. */
  error: string | null;
  wrapLine: string | null;
}

export type RoomEvent =
  | { type: "INTRO"; line: string }
  | { type: "SPEECH_DONE" }
  | { type: "DRAFT_CHANGED"; text: string }
  | { type: "RECORD_START" }
  | { type: "RECORD_STOP"; transcript: string }
  | { type: "RERECORD" }
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
    error: null,
    wrapLine: null,
  };
}

function spokenQuestion(q: QuestionView): string[] {
  return q.lead ? [q.lead, q.text] : [q.text];
}

/** Where a candidate composes or reviews an answer, by input mode. */
function answerPhase(state: RoomState): Phase {
  return state.inputMode === "voice" && state.draft ? "reviewing" : "awaitingAnswer";
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
      return { ...state, phase: answerPhase(state), speech: [] };

    case "DRAFT_CHANGED":
      if (state.phase !== "awaitingAnswer" && state.phase !== "reviewing") return state;
      return { ...state, draft: event.text };

    case "RECORD_START":
      if (state.inputMode !== "voice") return state;
      if (state.phase !== "awaitingAnswer" && state.phase !== "reviewing") return state;
      return { ...state, phase: "recording", draft: "", error: null };

    case "RECORD_STOP":
      if (state.phase !== "recording") return state;
      return { ...state, phase: event.transcript.trim() ? "reviewing" : "awaitingAnswer", draft: event.transcript };

    case "RERECORD":
      if (state.phase !== "reviewing") return state;
      return { ...state, phase: "awaitingAnswer", draft: "" };

    case "SUBMIT":
      if (state.phase !== "awaitingAnswer" && state.phase !== "reviewing") return state;
      if (!state.draft.trim()) return state;
      return { ...state, phase: "submitting", error: null };

    case "NUDGE":
      // Not scored, not counted: the same question stands and the draft is
      // kept so the candidate can build on it.
      if (state.phase !== "submitting") return state;
      return { ...state, phase: "speaking", nudge: event.line, speech: [event.line] };

    case "TURN_OK": {
      if (state.phase !== "submitting") return state;
      const base = {
        ...state,
        turnSeq: state.turnSeq + 1,
        notes: [...state.notes, event.note],
        progress: { ...state.progress, ...event.progress },
        draft: "",
        nudge: null,
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
      if (state.phase !== "submitting") return state;
      return { ...state, phase: answerPhase(state), error: event.message };

    case "STALE":
      if (state.phase !== "submitting") return state;
      return { ...state, phase: "resyncing" };

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
