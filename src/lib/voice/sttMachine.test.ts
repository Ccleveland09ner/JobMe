import { describe, expect, it } from "vitest";

import {
  MAX_CONSECUTIVE_NO_SPEECH,
  initialState,
  reduce,
  transcriptOf,
  type Ev,
  type Effect,
  type MachineState,
} from "./sttMachine";

/** Drives a sequence of events, collecting every effect emitted. */
function run(events: Ev[], from: MachineState = initialState()) {
  let state = from;
  const effects: Effect[] = [];
  for (const ev of events) {
    const out = reduce(state, ev);
    state = out.state;
    effects.push(...out.effects);
  }
  return { state, effects, transcript: transcriptOf(state) };
}

const finals = (...texts: string[]) =>
  texts.map((text) => ({ isFinal: true, text }));

const kinds = (effects: Effect[]) => effects.map((e) => e.e);

describe("normal capture", () => {
  it("captures one session and resolves on release", () => {
    const { state, effects, transcript } = run([
      { t: "HOLD_START", now: 0 },
      { t: "STARTED", now: 50 },
      { t: "RESULT", resultIndex: 0, results: finals("I rewrote the scheduler.") },
      { t: "HOLD_END", now: 3000 },
      { t: "ENDED", now: 3100 },
    ]);

    expect(transcript).toBe("I rewrote the scheduler.");
    expect(state.phase).toBe("idle");
    expect(state.endedBy).toBe("user");
    expect(kinds(effects)).toContain("RESOLVE");
  });

  it("never commits interim text", () => {
    const { transcript, state } = run([
      { t: "HOLD_START", now: 0 },
      { t: "STARTED", now: 10 },
      { t: "RESULT", resultIndex: 0, results: [{ isFinal: false, text: "I rew" }] },
    ]);
    expect(transcript).toBe("");
    expect(state.interim).toBe("I rew");
  });

  it("ignores a duplicate HOLD_START", () => {
    const { state } = run([
      { t: "HOLD_START", now: 0 },
      { t: "HOLD_START", now: 5 },
    ]);
    expect(state.phase).toBe("starting");
  });
});

describe("auto-restart across a silence", () => {
  it("stitches two sessions into one transcript", () => {
    const { state, transcript } = run([
      { t: "HOLD_START", now: 0 },
      { t: "STARTED", now: 10 },
      { t: "RESULT", resultIndex: 0, results: finals("First sentence.") },
      { t: "ENDED", now: 5000 },
      { t: "RESTART_TICK", now: 5010 },
      { t: "STARTED", now: 5050 },
      { t: "RESULT", resultIndex: 0, results: finals("Second sentence.") },
      { t: "HOLD_END", now: 9000 },
      { t: "ENDED", now: 9100 },
    ]);

    expect(transcript).toBe("First sentence. Second sentence.");
    expect(state.sessionCount).toBe(2);
    expect(state.restarts).toBe(1);
  });

  /**
   * THE duplication test. `event.results` is per-session, so a second session
   * replaying index 0 would re-commit the first session's text if the reducer
   * trusted `resultIndex` alone.
   */
  it("does not duplicate finals when a new session replays index 0", () => {
    const { transcript } = run([
      { t: "HOLD_START", now: 0 },
      { t: "STARTED", now: 10 },
      { t: "RESULT", resultIndex: 0, results: finals("Only once.") },
      { t: "RESULT", resultIndex: 0, results: finals("Only once.") },
      { t: "HOLD_END", now: 100 },
      { t: "ENDED", now: 110 },
    ]);
    expect(transcript).toBe("Only once.");
  });

  it("does not text-dedupe legitimately repeated words", () => {
    const { transcript } = run([
      { t: "HOLD_START", now: 0 },
      { t: "STARTED", now: 10 },
      { t: "RESULT", resultIndex: 0, results: finals("No.") },
      { t: "ENDED", now: 20 },
      { t: "RESTART_TICK", now: 25 },
      { t: "STARTED", now: 30 },
      { t: "RESULT", resultIndex: 0, results: finals("No.") },
      { t: "HOLD_END", now: 40 },
      { t: "ENDED", now: 50 },
    ]);
    expect(transcript).toBe("No. No.");
  });

  it("sums capture time across sessions, excluding the gaps", () => {
    const { state } = run([
      { t: "HOLD_START", now: 0 },
      { t: "STARTED", now: 0 },
      { t: "ENDED", now: 1000 },
      { t: "RESTART_TICK", now: 3000 },
      { t: "STARTED", now: 3000 },
      { t: "HOLD_END", now: 4000 },
      { t: "ENDED", now: 4000 },
    ]);
    // 1000ms + 1000ms captured; the 2000ms gap is not capture time.
    expect(state.captureMs).toBe(2000);
  });
});

describe("release races", () => {
  /**
   * Release landed while the session was still opening. `start()` is async, so
   * a session arrives anyway and must be stopped — otherwise the microphone
   * indicator stays lit after the user let go.
   */
  it("stops a session that arrives after release", () => {
    const { state, effects } = run([
      { t: "HOLD_START", now: 0 },
      { t: "HOLD_END", now: 20 },
      { t: "STARTED", now: 40 },
    ]);
    expect(state.phase).toBe("stopping");
    expect(kinds(effects)).toContain("STOP");
  });

  it("resolves immediately when released mid-restart", () => {
    const { state, effects } = run([
      { t: "HOLD_START", now: 0 },
      { t: "STARTED", now: 10 },
      { t: "ENDED", now: 1000 },
      { t: "HOLD_END", now: 1010 },
    ]);
    expect(state.phase).toBe("idle");
    expect(kinds(effects)).toContain("RESOLVE");
  });

  it("ignores a restart tick that fires after release", () => {
    const { state, effects } = run([
      { t: "HOLD_START", now: 0 },
      { t: "STARTED", now: 10 },
      { t: "ENDED", now: 1000 },
      { t: "HOLD_END", now: 1010 },
      { t: "RESTART_TICK", now: 1200 },
    ]);
    expect(state.sessionCount).toBe(1);
    expect(kinds(effects).filter((k) => k === "CREATE_AND_START")).toHaveLength(1);
  });

  it("ignores results that arrive after resolution", () => {
    const { transcript } = run([
      { t: "HOLD_START", now: 0 },
      { t: "STARTED", now: 10 },
      { t: "HOLD_END", now: 100 },
      { t: "ENDED", now: 110 },
      { t: "RESULT", resultIndex: 0, results: finals("too late") },
    ]);
    expect(transcript).toBe("");
  });

  it("forces resolution when stop() never flushes", () => {
    const { state, effects } = run([
      { t: "HOLD_START", now: 0 },
      { t: "STARTED", now: 10 },
      { t: "HOLD_END", now: 100 },
      { t: "STOP_DEADLINE", now: 1000 },
    ]);
    expect(state.phase).toBe("idle");
    expect(kinds(effects)).toContain("ABORT");
    expect(kinds(effects)).toContain("RESOLVE");
  });
});

describe("errors", () => {
  it("arms a watchdog rather than restarting on error", () => {
    const { state, effects } = run([
      { t: "HOLD_START", now: 0 },
      { t: "STARTED", now: 10 },
      { t: "ERROR", code: "no-speech" },
    ]);
    expect(state.phase).toBe("running");
    expect(effects.some((e) => e.e === "ARM" && e.timer === "endWatchdog")).toBe(
      true,
    );
  });

  it("synthesises an end when onerror is not followed by onend", () => {
    const { state } = run([
      { t: "HOLD_START", now: 0 },
      { t: "STARTED", now: 10 },
      { t: "ERROR", code: "no-speech" },
      { t: "END_WATCHDOG", now: 300 },
    ]);
    expect(state.phase).toBe("restarting");
  });

  it("gives up after a run of silence instead of looping forever", () => {
    let state = initialState();
    state = reduce(state, { t: "HOLD_START", now: 0 }).state;
    state = reduce(state, { t: "STARTED", now: 1 }).state;

    for (let i = 0; i < MAX_CONSECUTIVE_NO_SPEECH; i++) {
      state = reduce(state, { t: "ERROR", code: "no-speech" }).state;
      state = reduce(state, { t: "ENDED", now: 100 * i }).state;
      if (state.phase === "restarting") {
        state = reduce(state, { t: "RESTART_TICK", now: 100 * i + 10 }).state;
        state = reduce(state, { t: "STARTED", now: 100 * i + 20 }).state;
      }
    }

    expect(state.endedBy).toBe("restart-budget");
    expect(state.phase).toBe("idle");
  });

  it("clears the silence streak when speech arrives", () => {
    const { state } = run([
      { t: "HOLD_START", now: 0 },
      { t: "STARTED", now: 10 },
      { t: "ERROR", code: "no-speech" },
      { t: "RESULT", resultIndex: 0, results: finals("finally said something") },
    ]);
    expect(state.consecutiveNoSpeech).toBe(0);
  });

  it.each(["not-allowed", "audio-capture", "service-not-allowed"] as const)(
    "stops listening on the fatal error %s",
    (code) => {
      const { state } = run([
        { t: "HOLD_START", now: 0 },
        { t: "STARTED", now: 10 },
        { t: "ERROR", code },
        { t: "ENDED", now: 20 },
      ]);
      expect(state.wantListening).toBe(false);
      expect(state.endedBy).toBe("fatal");
      expect(state.phase).toBe("idle");
    },
  );
});
