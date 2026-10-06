import { describe, expect, it } from "vitest";

import type { NoteView, QuestionView } from "@/lib/frontend/types";

import { avatarState, initRoom, roomReducer, type RoomEvent, type RoomState } from "./roomMachine";

const Q1: QuestionView = { text: "Tell me about a team project.", type: "opening", topic: "teamwork", source: "bank" };
const Q2: QuestionView = {
  text: "What did you personally change?",
  type: "clarify",
  topic: "teamwork",
  source: "bank",
};
const Q3: QuestionView = {
  text: "Tell me about your internship.",
  type: "opening",
  topic: "technical_challenge",
  source: "resume",
  lead: "Something on your resume caught my eye.",
};

const NOTE: NoteView = {
  seq: 1,
  topic: "teamwork",
  questionType: "opening",
  source: "bank",
  scores: { ownership: 1 },
  band: "weak",
  primaryGap: "ownership",
  evidence: "we fixed it",
  observation: "No clear individual contribution",
  reason: 'Says "we" throughout → asking what they changed',
  degraded: false,
};

function room(overrides: Partial<RoomState> = {}): RoomState {
  return {
    ...initRoom({ question: Q1, turnSeq: 0, progress: { questionCount: 1, questionCap: 10, mode: "quick" }, notes: [], inputMode: "typed" }),
    ...overrides,
  };
}

function run(state: RoomState, ...events: RoomEvent[]): RoomState {
  return events.reduce(roomReducer, state);
}

const turnOk = (next: QuestionView | null, extra: Partial<Extract<RoomEvent, { type: "TURN_OK" }>> = {}): RoomEvent => ({
  type: "TURN_OK",
  note: NOTE,
  next,
  done: next === null,
  wrapLine: null,
  progress: { questionCount: 2, questionCap: 10 },
  ...extra,
});

describe("typed loop", () => {
  it("opens speaking the question, then waits for an answer", () => {
    const s = room();
    expect(s.phase).toBe("speaking");
    expect(s.speech).toEqual([Q1.text]);
    expect(run(s, { type: "SPEECH_DONE" }).phase).toBe("awaitingAnswer");
  });

  it("ignores an empty submit", () => {
    const s = run(room(), { type: "SPEECH_DONE" }, { type: "DRAFT_CHANGED", text: "   " }, { type: "SUBMIT" });
    expect(s.phase).toBe("awaitingAnswer");
  });

  it("applies the server's turn: note appended, seq advanced, next question spoken", () => {
    const s = run(
      room(),
      { type: "SPEECH_DONE" },
      { type: "DRAFT_CHANGED", text: "We worked as a team and fixed the bug." },
      { type: "SUBMIT" },
      turnOk(Q2),
    );
    expect(s.phase).toBe("speaking");
    expect(s.turnSeq).toBe(1);
    expect(s.notes).toEqual([NOTE]);
    expect(s.question).toEqual(Q2);
    expect(s.draft).toBe("");
    // Mode is kept from the initial progress; the turn response omits it.
    expect(s.progress).toEqual({ questionCount: 2, questionCap: 10, mode: "quick" });
  });

  it("speaks a transition lead before a new thread's question", () => {
    const s = run(room({ phase: "submitting", draft: "x" }), turnOk(Q3));
    expect(s.speech).toEqual([Q3.lead, Q3.text]);
  });

  it("finishes on done with the wrap line", () => {
    const s = run(room({ phase: "submitting", draft: "x" }), turnOk(null, { wrapLine: "That's everything." }));
    expect(s.phase).toBe("done");
    expect(s.wrapLine).toBe("That's everything.");
    expect(s.notes).toHaveLength(1);
  });
});

describe("degraded paths", () => {
  it("a nudge keeps the question, the seq and the draft", () => {
    const s = run(room({ phase: "submitting", draft: "Yes." }), { type: "NUDGE", line: "Could you say a bit more?" });
    expect(s.phase).toBe("speaking");
    expect(s.speech).toEqual(["Could you say a bit more?"]);
    expect(s.turnSeq).toBe(0);
    expect(s.draft).toBe("Yes.");
    expect(s.question).toEqual(Q1);
  });

  it("a failed submit returns to the answer with the draft and a message", () => {
    const s = run(room({ phase: "submitting", draft: "My answer" }), { type: "SUBMIT_FAILED", message: "Try again." });
    expect(s.phase).toBe("awaitingAnswer");
    expect(s.draft).toBe("My answer");
    expect(s.error).toBe("Try again.");
  });

  it("a stale submit waits for the server's state instead of retrying", () => {
    const s = run(room({ phase: "submitting", draft: "x" }), { type: "STALE" });
    expect(s.phase).toBe("resyncing");
    expect(s.turnSeq).toBe(0);
  });

  it("a degraded note is appended like any other — no client-side scoring", () => {
    const degraded = { ...NOTE, scores: null, band: null, degraded: true };
    const s = run(room({ phase: "submitting", draft: "x" }), { ...turnOk(Q2), note: degraded } as RoomEvent);
    expect(s.notes[0]).toEqual(degraded);
  });
});

describe("guards", () => {
  it("ignores a second submit while one is in flight", () => {
    const s = room({ phase: "submitting", draft: "x" });
    expect(run(s, { type: "SUBMIT" })).toBe(s);
  });

  it("ignores a turn result that arrives when nothing was submitted", () => {
    const s = room({ phase: "awaitingAnswer" });
    expect(run(s, turnOk(Q2))).toBe(s);
  });

  it("does not end mid-submit", () => {
    const s = room({ phase: "submitting", draft: "x" });
    expect(run(s, { type: "END" })).toBe(s);
  });

  it("prepends the intro only before the first answer", () => {
    expect(run(room(), { type: "INTRO", line: "Hi Dani." }).speech).toEqual(["Hi Dani.", Q1.text]);
    const resumed = room({ turnSeq: 3 });
    expect(run(resumed, { type: "INTRO", line: "Hi Dani." })).toBe(resumed);
  });
});

describe("voice phases", () => {
  const voice = () => room({ inputMode: "voice", phase: "awaitingAnswer" });

  it("record -> review -> submit", () => {
    const s = run(voice(), { type: "RECORD_START" }, { type: "RECORD_STOP", transcript: "I led the migration." });
    expect(s.phase).toBe("reviewing");
    expect(run(s, { type: "SUBMIT" }).phase).toBe("submitting");
  });

  it("re-record clears the transcript", () => {
    const s = run(voice(), { type: "RECORD_START" }, { type: "RECORD_STOP", transcript: "Uh" }, { type: "RERECORD" });
    expect(s.phase).toBe("awaitingAnswer");
    expect(s.draft).toBe("");
  });

  it("does not record in typed mode", () => {
    const s = room({ phase: "awaitingAnswer" });
    expect(run(s, { type: "RECORD_START" })).toBe(s);
  });
});

describe("avatarState", () => {
  it("maps phases to avatar states", () => {
    expect(avatarState("speaking")).toBe("speaking");
    expect(avatarState("recording")).toBe("listening");
    expect(avatarState("submitting")).toBe("thinking");
    expect(avatarState("awaitingAnswer")).toBe("idle");
  });
});
