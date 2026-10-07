"use client";

/**
 * One voice answer: tap to start, live transcript, and an idle timer that
 * sends the answer IDLE_SEND_MS after the last recognised word.
 *
 * Built on lib/voice/stt.ts (unchanged). Two details of that adapter shape
 * this hook:
 *   - `stop()` only resolves if the recognizer is still running. When it has
 *     already ended on its own (a fatal mic error, or the silence budget),
 *     calling it would never settle, so the transcript is read from the last
 *     machine state instead.
 *   - Chrome restarts recognition sessions under us; the machine stitches
 *     them, and `captureMs` is summed across them. That is the duration the
 *     server computes words-per-minute over.
 *
 * Idle is measured from the last change in the recognised text (interim or
 * final), not from microphone volume: a noisy room cannot hold the window
 * open, and a cough does not count as an answer.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { createRecognizer } from "@/lib/voice/stt";
import { transcriptOf, type MachineState } from "@/lib/voice/sttMachine";

import { idleStatus } from "./roomMachine";

export interface VoiceAnswer {
  transcript: string;
  /** Start to Send, including thinking pauses. */
  holdMs: number;
  /** Time the recognizer was actually capturing. */
  captureMs: number;
}

type Recognizer = ReturnType<typeof createRecognizer>;

const TICK_MS = 250;

function liveText(s: MachineState): string {
  return [transcriptOf(s), s.interim.trim()].filter(Boolean).join(" ");
}

export function useVoiceAnswer(handlers: {
  /** The transcript so far, including interim words. */
  onText: (text: string) => void;
  /** The idle window ran out. `hasText` false means nothing was heard. */
  onIdle: (hasText: boolean) => void;
  /** The mic became unusable mid-answer; carries whatever was heard. */
  onFatal: (heard: string) => void;
}) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  const rec = useRef<Recognizer | null>(null);
  const machine = useRef<MachineState | null>(null);
  const active = useRef(false);
  const startedAt = useRef(0);
  const lastActivity = useRef(0);
  const lastText = useRef("");
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const stopTicker = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    setSecondsLeft(null);
  }, []);

  /** Stops listening and discards the answer. */
  const abort = useCallback(() => {
    const wasActive = active.current;
    active.current = false;
    stopTicker();
    const r = rec.current;
    rec.current = null;
    // Only a running recognizer can be stopped; the result is ignored.
    if (wasActive && r && machine.current?.phase !== "idle") void r.stop();
  }, [stopTicker]);

  const start = useCallback(() => {
    if (active.current) return;
    active.current = true;
    machine.current = null;
    lastText.current = "";
    startedAt.current = performance.now();
    lastActivity.current = startedAt.current;

    const r = createRecognizer({
      onState: (s) => {
        machine.current = s;
        if (!active.current || rec.current !== r) return;

        const text = liveText(s);
        if (text !== lastText.current) {
          lastText.current = text;
          lastActivity.current = performance.now();
          latest.current.onText(text);
        }

        // Ended on its own while we still wanted it.
        if (s.phase === "idle" && s.endedBy && s.endedBy !== "user") {
          const heard = transcriptOf(s) || lastText.current;
          active.current = false;
          stopTicker();
          if (s.endedBy === "fatal") latest.current.onFatal(heard);
          else latest.current.onIdle(Boolean(heard));
        }
      },
    });
    rec.current = r;
    r.start();

    ticker.current = setInterval(() => {
      if (!active.current) return;
      const status = idleStatus(performance.now(), lastActivity.current);
      setSecondsLeft(status.secondsLeft);
      if (status.expired) {
        const hasText = Boolean(lastText.current.trim());
        // Nothing heard: stop here. With text, the room sends, and finish()
        // collects the final transcript.
        if (!hasText) abort();
        else stopTicker();
        latest.current.onIdle(hasText);
      }
    }, TICK_MS);
  }, [abort, stopTicker]);

  /** Stops listening and returns the answer, flushing the final words. */
  const finish = useCallback(async (): Promise<VoiceAnswer> => {
    active.current = false;
    stopTicker();
    const r = rec.current;
    rec.current = null;
    const holdMs = Math.round(performance.now() - startedAt.current);

    const s = machine.current;
    if (!r || !s || s.phase === "idle") {
      return {
        transcript: (s ? transcriptOf(s) : "") || lastText.current,
        holdMs,
        captureMs: Math.round(s?.captureMs ?? 0),
      };
    }
    const result = await r.stop();
    return {
      // stop() usually flushes the last words as a final; if it did not,
      // the interim text on screen is the best record of what was said.
      transcript: result.transcript || lastText.current,
      holdMs,
      captureMs: Math.round(result.captureMs),
    };
  }, [stopTicker]);

  // Never leave the microphone open behind an unmounted room.
  useEffect(() => abort, [abort]);

  return { start, finish, abort, isActive: () => active.current, secondsLeft };
}
