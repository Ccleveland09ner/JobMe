"use client";

/**
 * Sending an answer: one request per SUBMIT, guarded by phase and seq. A live
 * recording is stopped and flushed first. Leaving mid-send ("Continue later")
 * still sends the answer; the room just stops reacting. The reply to the
 * greeting is answered here instead of sent.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, type Dispatch } from "react";

import { useAlive } from "@/components/common/useAlive";
import { greetingReply } from "@/lib/engine/opening";
import { noteFromResponse } from "@/lib/frontend/adapters";
import { submitTurn } from "@/lib/frontend/api";
import type { InputMode } from "@/lib/frontend/types";
import { playAck } from "@/lib/voice/tts";

import type { Phase, RoomEvent } from "./roomMachine";
import type { VoiceAnswer } from "./useVoiceAnswer";

type Timings = { holdMs: number; captureMs?: number };

export function useTurnSubmission({
  phase,
  turnSeq,
  draft,
  inputMode,
  sessionId,
  reportHref,
  dispatch,
  voiceActive,
  finishVoice,
  greeting,
}: {
  phase: Phase;
  /** The answer is to the greeting: answered here, never sent or scored. */
  greeting: boolean;
  turnSeq: number;
  draft: string;
  inputMode: InputMode;
  sessionId: string;
  reportHref: string;
  dispatch: Dispatch<RoomEvent>;
  /** Whether a voice answer is being recorded, and how to stop it and collect it. */
  voiceActive: () => boolean;
  finishVoice: () => Promise<VoiceAnswer>;
}) {
  const router = useRouter();
  const alive = useAlive();
  const submittedSeq = useRef<number | null>(null);
  /** Timings of the last voice answer, for a retry after a failed send. */
  const lastVoiceTimings = useRef<Timings | null>(null);

  const greeted = useRef(false);

  useEffect(() => {
    if (phase !== "submitting") return;

    // Small talk: the recruiter answers it, and the turn sequence is untouched.
    if (greeting) {
      if (greeted.current) return;
      greeted.current = true;
      void (async () => {
        const reply = (voiceActive() ? (await finishVoice()).transcript : draft).trim();
        if (!reply) {
          greeted.current = false;
          dispatch({ type: "RECORD_CANCEL", notice: "We didn't catch any words. Press the mic and try again." });
          return;
        }
        dispatch({ type: "GREETED", reply: greetingReply(reply) });
      })();
      return;
    }

    const clientTurnSeq = turnSeq + 1;
    if (submittedSeq.current === clientTurnSeq) return;
    submittedSeq.current = clientTurnSeq;

    void (async () => {
      // A live recording is stopped and flushed; otherwise send the draft.
      let transcript = draft.trim();
      let timings: Timings = { holdMs: 0 };
      if (voiceActive()) {
        const answer = await finishVoice();
        transcript = answer.transcript.trim();
        timings = { holdMs: answer.holdMs, captureMs: answer.captureMs };
        lastVoiceTimings.current = timings;
      } else if (inputMode === "voice" && lastVoiceTimings.current) {
        timings = lastVoiceTimings.current;
      }
      // Typed answers send no capture time, so the server reports no wpm.

      if (!transcript) {
        submittedSeq.current = null;
        dispatch({
          type: "RECORD_CANCEL",
          notice: "We didn't catch any words. Press the mic and try again.",
        });
        return;
      }

      // Covers the scoring wait (~0.3s target). Silent if clips are missing.
      if (alive.current) playAck();

      const offline = () => {
        submittedSeq.current = null;
        dispatch({ type: "SUBMIT_FAILED", message: "We couldn't reach the server. Your answer is kept — try sending again." });
      };
      try {
        const outcome = await submitTurn(sessionId, { transcript, clientTurnSeq, ...timings });
        if (!alive.current) return;
        switch (outcome.kind) {
          case "stale":
            dispatch({ type: "STALE" });
            router.refresh();
            return;
          case "finished":
            // Already finished elsewhere: the scorecard is the right place.
            router.push(reportHref);
            return;
          case "failed":
            submittedSeq.current = null;
            dispatch({ type: "SUBMIT_FAILED", message: outcome.message });
            return;
          case "offline":
            return offline();
          case "nudge":
            submittedSeq.current = null;
            dispatch({ type: "NUDGE", line: outcome.line });
            return;
        }
        const { turn } = outcome;
        lastVoiceTimings.current = null;
        // The note renders before the next question is spoken.
        dispatch({
          type: "TURN_OK",
          note: noteFromResponse(turn.notepad),
          next: turn.next
            ? {
                text: turn.next.text,
                type: turn.next.type,
                topic: turn.next.topic,
                source: turn.next.source,
                lead: turn.next.lead,
              }
            : null,
          done: turn.done,
          wrapLine: turn.wrapLine ?? null,
          progress: turn.progress,
        });
      } catch {
        offline();
      }
    })();
  }, [phase, greeting, turnSeq, draft, inputMode, sessionId, router, reportHref, alive, voiceActive, finishVoice, dispatch]);
}
