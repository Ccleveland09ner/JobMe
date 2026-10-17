"use client";

/**
 * Browser adapter. All decisions live in `sttMachine.ts`; this only translates
 * DOM events into machine events and runs the effects that come back.
 */

import {
  initialState,
  reduce,
  transcriptOf,
  type Effect,
  type Ev,
  type MachineState,
  type SttErrorCode,
} from "./sttMachine";

export interface SttResult {
  transcript: string;
  /** Talk button held, including thinking pauses. For pacing feedback. */
  holdMs: number;
  /** Recognizer actually capturing, summed across restarts. `wpm` uses this. */
  captureMs: number;
  sessionCount: number;
  restarts: number;
  endedBy: MachineState["endedBy"];
  lastError: SttErrorCode | null;
}

export interface RecognizerCallbacks {
  onInterim?: (text: string) => void;
  /** A final chunk arrived — NOT "the hold finished". */
  onSegment?: (text: string) => void;
  onState?: (state: MachineState) => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  processLocally?: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((e: unknown) => void) | null;
  onend: ((e: unknown) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onresult: ((e: SpeechResultEventLike) => void) | null;
}

interface SpeechResultEventLike {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string }> & { isFinal: boolean }
  >;
}

function ctor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, SpeechRecognitionCtor>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Necessary but not sufficient: Firefox preview builds expose the constructor
 * and throw on `start()`. Probe inside a user gesture for certainty.
 */
export function isSttSupported(): boolean {
  return ctor() !== null;
}

type OnDevice = "unknown" | "available" | "unavailable";

/**
 * Whether the browser has an installed on-device English model (Chrome
 * 139+: SpeechRecognition.available). Asked once, in the background; until
 * the answer arrives, and wherever the API does not exist, the browser's
 * normal (online) recognition is used.
 */
let onDevice: OnDevice = "unknown";
let onDeviceAsked = false;
/** Set if an on-device start failed anyway: online for the rest of the page. */
let localFailed = false;

function askOnDevice(): void {
  if (onDeviceAsked) return;
  onDeviceAsked = true;
  const available = (ctor() as unknown as {
    available?: (opts: { langs: string[]; processLocally: boolean }) => Promise<string>;
  } | null)?.available;
  if (typeof available !== "function") {
    onDevice = "unavailable";
    return;
  }
  available
    .call(ctor(), { langs: ["en-US"], processLocally: true })
    .then((answer) => {
      onDevice = answer === "available" ? "available" : "unavailable";
    })
    .catch(() => {
      onDevice = "unavailable";
    });
}

/** Errors that mean "this way of recognising does not work here", not "no mic". */
const LOCAL_ONLY_FAILURES: readonly string[] = ["language-not-supported", "service-not-allowed"];

export function createRecognizer(callbacks: RecognizerCallbacks = {}) {
  askOnDevice();
  let usingLocal = false;
  let state = initialState();
  let current: SpeechRecognitionLike | null = null;
  let resolve: ((r: SttResult) => void) | null = null;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const now = () => performance.now();

  function clearTimer(name: string) {
    const t = timers.get(name);
    if (t) clearTimeout(t);
    timers.delete(name);
  }

  /** Detach BEFORE aborting, so a dying instance emits nothing. */
  function detach(recognition: SpeechRecognitionLike | null) {
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
  }

  function send(ev: Ev) {
    const out = reduce(state, ev);
    state = out.state;
    callbacks.onState?.(state);
    for (const effect of out.effects) apply(effect);
  }

  function apply(effect: Effect) {
    switch (effect.e) {
      case "CREATE_AND_START": {
        const Ctor = ctor();
        if (!Ctor) {
          send({ t: "ERROR", code: "not-allowed" });
          return;
        }
        // Fresh instance per session: a wedged recognizer refuses to
        // restart, a new object never does.
        detach(current);
        const recognition = new Ctor();
        current = recognition;

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.maxAlternatives = 1;
        // On-device recognition (Chrome 139+) only when the browser says the
        // English model is installed. Forcing it otherwise makes start() fail
        // with `language-not-supported` — a fatal error — on every machine
        // that has not downloaded the pack, which dropped every voice
        // interview straight to typed answers.
        usingLocal = onDevice === "available" && !localFailed;
        if (usingLocal) {
          try {
            recognition.processLocally = true;
          } catch {
            usingLocal = false; // not supported; the remote service is used
          }
        }

        const guard =
          (fn: (e: never) => void) =>
          (e: unknown) => {
            // Drop events from a superseded instance.
            if (recognition !== current) return;
            fn(e as never);
          };

        recognition.onstart = guard(() => send({ t: "STARTED", now: now() }));
        recognition.onend = guard(() => send({ t: "ENDED", now: now() }));
        recognition.onerror = guard((e: { error?: string }) => {
          const code = (e?.error as SttErrorCode) ?? "unknown";
          if (usingLocal && LOCAL_ONLY_FAILURES.includes(code)) {
            // The on-device model said yes but would not run: fall back to
            // online recognition and let the machine restart, rather than
            // ending the answer on a fatal error.
            localFailed = true;
            send({ t: "ERROR", code: "network" });
            return;
          }
          send({ t: "ERROR", code });
        });
        recognition.onresult = guard((e: SpeechResultEventLike) => {
          const results: { isFinal: boolean; text: string }[] = [];
          for (let i = 0; i < e.results.length; i++) {
            const r = e.results[i];
            results.push({ isFinal: r.isFinal, text: r[0]?.transcript ?? "" });
          }
          send({ t: "RESULT", resultIndex: e.resultIndex, results });
        });

        try {
          recognition.start();
        } catch {
          // Phase already guards this; if it still throws, treat it as an
          // end and let the machine decide whether to retry.
          send({ t: "ENDED", now: now() });
        }
        return;
      }

      case "STOP":
        try {
          current?.stop();
        } catch {
          send({ t: "ENDED", now: now() });
        }
        return;

      case "ABORT":
        detach(current);
        try {
          current?.abort();
        } catch {
          /* already dead */
        }
        current = null;
        return;

      case "ARM": {
        clearTimer(effect.timer);
        const timer = setTimeout(() => {
          timers.delete(effect.timer);
          if (effect.timer === "restart") send({ t: "RESTART_TICK", now: now() });
          else if (effect.timer === "endWatchdog")
            send({ t: "END_WATCHDOG", now: now() });
          else send({ t: "STOP_DEADLINE", now: now() });
        }, effect.ms);
        timers.set(effect.timer, timer);
        return;
      }

      case "EMIT_INTERIM":
        callbacks.onInterim?.(effect.text);
        return;

      case "EMIT_SEGMENT":
        callbacks.onSegment?.(effect.text);
        return;

      case "RESOLVE": {
        for (const name of [...timers.keys()]) clearTimer(name);
        detach(current);
        current = null;
        const settle = resolve;
        resolve = null;
        settle?.({
          transcript: transcriptOf(state),
          holdMs:
            state.holdStartedAt !== null ? now() - state.holdStartedAt : 0,
          captureMs: state.captureMs,
          sessionCount: state.sessionCount,
          restarts: state.restarts,
          endedBy: state.endedBy,
          lastError: state.lastError,
        });
        return;
      }
    }
  }

  return {
    /** pointerdown / keydown. The machine ignores auto-repeat. */
    start() {
      send({ t: "HOLD_START", now: now() });
    },

    /**
     * pointerup, and ALSO blur, visibilitychange->hidden, pointercancel and
     * contextmenu: a lost keyup (alt-tab mid-answer) otherwise leaves the
     * microphone open indefinitely.
     */
    stop(): Promise<SttResult> {
      return new Promise<SttResult>((settle) => {
        resolve = settle;
        send({ t: "HOLD_END", now: now() });
      });
    },

    getState: () => state,
  };
}
