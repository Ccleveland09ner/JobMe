/**
 * Speech recognition as a pure reducer. Split from the browser adapter because
 * every capture bug is a state bug, and a reducer is the only part testable
 * without a microphone.
 *
 * Web Speech is less forgiving than it looks:
 *   - Recognition ends on its own at no documented interval, so long answers
 *     must be stitched from several sessions.
 *   - `onend` fires for your own `stop()` too.
 *   - `event.resultIndex` resets per session, so re-walking from 0 after a
 *     restart duplicates the transcript.
 *   - Interim results are not guaranteed and are frequently revised.
 *
 * Ref: TechDesign > Speech Input
 */

export type Phase = "idle" | "starting" | "running" | "restarting" | "stopping";

export type SttErrorCode =
  | "aborted"
  | "audio-capture"
  | "language-not-supported"
  | "network"
  | "no-speech"
  | "not-allowed"
  | "service-not-allowed"
  | "unknown";

export type EndReason = "user" | "fatal" | "restart-budget";

export interface MachineState {
  phase: Phase;
  /** User intent, tracked separately from phase. */
  wantListening: boolean;
  /** Final segments only. Interim text is never committed. */
  committed: string[];
  interim: string;
  /** Guards against re-committing results after a session restart. */
  finalHighWater: number;
  sessionCount: number;
  restarts: number;
  consecutiveNoSpeech: number;
  holdStartedAt: number | null;
  sessionStartedAt: number | null;
  /** Summed time the recognizer was actually capturing. */
  captureMs: number;
  lastError: SttErrorCode | null;
  endedBy: EndReason | null;
}

export type Ev =
  | { t: "HOLD_START"; now: number }
  | { t: "HOLD_END"; now: number }
  | { t: "STARTED"; now: number }
  | { t: "ENDED"; now: number }
  | {
      t: "RESULT";
      resultIndex: number;
      results: { isFinal: boolean; text: string }[];
    }
  | { t: "ERROR"; code: SttErrorCode }
  | { t: "END_WATCHDOG"; now: number }
  | { t: "RESTART_TICK"; now: number }
  | { t: "STOP_DEADLINE"; now: number };

export type Effect =
  | { e: "CREATE_AND_START" }
  | { e: "STOP" }
  | { e: "ABORT" }
  | { e: "ARM"; timer: "restart" | "endWatchdog" | "stopDeadline"; ms: number }
  | { e: "EMIT_INTERIM"; text: string }
  | { e: "EMIT_SEGMENT"; text: string }
  | { e: "RESOLVE" };

/** Backoff between restarts after repeated silence. */
export const NO_SPEECH_BACKOFF = [0, 0, 200, 400, 800, 1200];
export const MAX_CONSECUTIVE_NO_SPEECH = 6;
export const MAX_RESTARTS = 12;
/** If `onerror` fires without `onend`, synthesise one. */
export const END_WATCHDOG_MS = 250;
/** Force resolution if `stop()` never produces `onend`. */
export const STOP_DEADLINE_MS = 900;

/** Restarting cannot fix these. */
const FATAL: SttErrorCode[] = [
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
  "language-not-supported",
];

export function initialState(): MachineState {
  return {
    phase: "idle",
    wantListening: false,
    committed: [],
    interim: "",
    finalHighWater: 0,
    sessionCount: 0,
    restarts: 0,
    consecutiveNoSpeech: 0,
    holdStartedAt: null,
    sessionStartedAt: null,
    captureMs: 0,
    lastError: null,
    endedBy: null,
  };
}

export function transcriptOf(state: MachineState): string {
  return state.committed.join(" ").replace(/\s+/g, " ").trim();
}

export function reduce(
  s: MachineState,
  ev: Ev,
): { state: MachineState; effects: Effect[] } {
  switch (ev.t) {
    case "HOLD_START": {
      // Pointerdown and Space both fire; the second is a no-op.
      if (s.wantListening) return { state: s, effects: [] };
      return {
        state: {
          ...initialState(),
          wantListening: true,
          phase: "starting",
          holdStartedAt: ev.now,
        },
        effects: [{ e: "CREATE_AND_START" }],
      };
    }

    case "STARTED": {
      // Released while opening. The session arrives regardless, so stop it
      // now — otherwise the mic indicator stays lit after release.
      if (s.phase === "stopping") {
        return { state: s, effects: [{ e: "STOP" }] };
      }
      if (s.phase !== "starting" && s.phase !== "restarting") {
        return { state: s, effects: [] };
      }
      return {
        state: {
          ...s,
          phase: "running",
          sessionCount: s.sessionCount + 1,
          sessionStartedAt: ev.now,
          // Result indices restart with the session.
          finalHighWater: 0,
          interim: "",
        },
        effects: [],
      };
    }

    case "RESULT": {
      // A late result must not mutate anything after resolution.
      if (s.phase === "idle") return { state: s, effects: [] };

      const effects: Effect[] = [];
      const committed = [...s.committed];
      let interim = "";
      let highWater = s.finalHighWater;

      // Max of the event index and our high-water mark: walking from 0
      // across a restart is what duplicates transcripts.
      for (let i = Math.max(ev.resultIndex, s.finalHighWater); i < ev.results.length; i++) {
        const r = ev.results[i];
        if (!r) continue;
        if (r.isFinal) {
          const text = r.text.trim();
          if (text) {
            committed.push(text);
            effects.push({ e: "EMIT_SEGMENT", text });
          }
          highWater = i + 1;
        } else {
          interim = r.text;
        }
      }

      if (interim) effects.push({ e: "EMIT_INTERIM", text: interim });

      return {
        state: {
          ...s,
          committed,
          interim,
          finalHighWater: highWater,
          // Any final speech clears the silence streak.
          consecutiveNoSpeech: effects.some((e) => e.e === "EMIT_SEGMENT")
            ? 0
            : s.consecutiveNoSpeech,
        },
        effects,
      };
    }

    case "ERROR": {
      // ERROR never restarts: it records and arms a watchdog in case `onend`
      // never comes. Closes the InvalidStateError window structurally, rather
      // than catching an error the spec does not actually promise.
      const fatal = FATAL.includes(ev.code);
      return {
        state: {
          ...s,
          lastError: ev.code,
          wantListening: fatal ? false : s.wantListening,
          endedBy: fatal ? "fatal" : s.endedBy,
          consecutiveNoSpeech:
            ev.code === "no-speech"
              ? s.consecutiveNoSpeech + 1
              : s.consecutiveNoSpeech,
        },
        effects: [
          { e: "ARM", timer: "endWatchdog", ms: END_WATCHDOG_MS },
        ],
      };
    }

    case "END_WATCHDOG": {
      // Only meaningful if ENDED never arrived.
      if (s.phase === "idle") return { state: s, effects: [] };
      return reduce(s, { t: "ENDED", now: ev.now });
    }

    case "ENDED": {
      const captureMs =
        s.sessionStartedAt !== null
          ? s.captureMs + Math.max(0, ev.now - s.sessionStartedAt)
          : s.captureMs;

      const base: MachineState = {
        ...s,
        captureMs,
        sessionStartedAt: null,
        interim: "",
      };

      // The user let go, or a fatal error ended it.
      if (!s.wantListening || s.phase === "stopping") {
        return {
          state: {
            ...base,
            phase: "idle",
            endedBy: base.endedBy ?? "user",
          },
          effects: [{ e: "RESOLVE" }],
        };
      }

      const exhausted =
        base.consecutiveNoSpeech >= MAX_CONSECUTIVE_NO_SPEECH ||
        base.restarts >= MAX_RESTARTS;

      if (exhausted) {
        return {
          state: { ...base, phase: "idle", endedBy: "restart-budget" },
          effects: [{ e: "RESOLVE" }],
        };
      }

      // Still held: stopped on its own, so stitch another session.
      const backoff =
        NO_SPEECH_BACKOFF[
          Math.min(base.consecutiveNoSpeech, NO_SPEECH_BACKOFF.length - 1)
        ];

      return {
        state: { ...base, phase: "restarting", restarts: base.restarts + 1 },
        effects: [{ e: "ARM", timer: "restart", ms: backoff }],
      };
    }

    case "RESTART_TICK": {
      // Phase-guarded: a timer firing after release is a no-op.
      if (s.phase !== "restarting" || !s.wantListening) {
        return { state: s, effects: [] };
      }
      return { state: s, effects: [{ e: "CREATE_AND_START" }] };
    }

    case "HOLD_END": {
      if (!s.wantListening) return { state: s, effects: [] };

      const stopped: MachineState = {
        ...s,
        wantListening: false,
        endedBy: s.endedBy ?? "user",
      };

      switch (s.phase) {
        case "running":
          return {
            state: { ...stopped, phase: "stopping" },
            effects: [
              { e: "STOP" },
              { e: "ARM", timer: "stopDeadline", ms: STOP_DEADLINE_MS },
            ],
          };

        case "starting":
          // Nothing to stop yet. Park here; STARTED will issue it.
          return {
            state: { ...stopped, phase: "stopping" },
            effects: [{ e: "ARM", timer: "stopDeadline", ms: STOP_DEADLINE_MS }],
          };

        case "restarting":
          // Nothing running, nothing to flush.
          return {
            state: { ...stopped, phase: "idle" },
            effects: [{ e: "RESOLVE" }],
          };

        default:
          return {
            state: { ...stopped, phase: "idle" },
            effects: [{ e: "RESOLVE" }],
          };
      }
    }

    case "STOP_DEADLINE": {
      // `stop()` should flush a final. If it never does, resolve anyway so
      // the promise settles exactly once.
      if (s.phase !== "stopping") return { state: s, effects: [] };
      return {
        state: { ...s, phase: "idle", endedBy: s.endedBy ?? "user" },
        effects: [{ e: "ABORT" }, { e: "RESOLVE" }],
      };
    }
  }
}
