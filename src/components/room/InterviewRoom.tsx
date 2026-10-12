"use client";

/**
 * Client orchestrator for the live interview. Owns the phase machine
 * (roomMachine.ts), the voice wiring and the network calls; every other room
 * component is presentational.
 * Ref: docs/TechDesign-JobMe-MVP.md > Interview Room (client orchestrator)
 *      docs/PRD-JobMe-MVP.md > Interview Room: Voice Loop
 *
 * One turn:
 *   1. speaking        the recruiter says the queued lines (speak()); mic disabled
 *   2. awaitingAnswer  mic enabled; the candidate taps Start answering
 *   3. recording       live transcript; Send, or 10s without a new word
 *   4. submitting      playAck() at once, then POST /api/sessions/[id]/turns
 *   5. the notepad entry renders BEFORE the next question is spoken
 *   6. done            the wrap line is spoken, then on to ./report
 *
 * A 409 with a body `state` means a stale clientTurnSeq (a double submit, or
 * another tab answered). The room does not read that engine state: it asks
 * the server page for a fresh render, and the page re-keys this component on
 * the server's turnSeq, so it remounts from the authoritative history.
 *
 * Never render raw JSON, model names or stack traces. Ref: PRD > Notepad.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useSyncExternalStore } from "react";

import { LoadingState } from "@/components/common/LoadingState";
import { buttonClasses } from "@/components/ui/Button";
import { friendlyError, noteFromResponse } from "@/lib/frontend/adapters";
import { takeIntro } from "@/lib/frontend/handoff";
import type { InputMode, NoteView, ProgressView, QuestionView, TurnResponse } from "@/lib/frontend/types";
import { readMouth, setSyntheticSpeaking, unlockAudio } from "@/lib/frontend/voiceSession";
import { isSttSupported } from "@/lib/voice/stt";
import { playAck, speak, stopSpeaking } from "@/lib/voice/tts";

import { Avatar } from "./Avatar";
import { Captions } from "./Captions";
import { EndInterviewDialog } from "./EndInterviewDialog";
import { Notepad } from "./Notepad";
import { ProgressPill } from "./ProgressPill";
import { PushToTalk } from "./PushToTalk";
import { avatarState, initRoom, roomReducer } from "./roomMachine";
import { useVoiceAnswer } from "./useVoiceAnswer";

/** Upper bound on any one spoken line, so a stuck audio path can never stall the room. */
const SPEECH_TIMEOUT_MS = 30_000;

export interface InterviewRoomProps {
  sessionId: string;
  question: QuestionView;
  turnSeq: number;
  progress: ProgressView;
  notes: NoteView[];
  /** What setup chose. Voice falls back to typed if the browser cannot do it. */
  requestedInput: InputMode;
}

const noSubscribe = () => () => {};

/** Says the lines; always resolves, whichever audio path (or none) worked. */
async function sayLines(lines: string[]): Promise<void> {
  const text = lines.join(" ").trim();
  if (!text) return;
  let synthetic = false;
  const spoken = speak(text, {
    onFallback: () => {
      // The browser voice exposes no audio stream to read the mouth from.
      synthetic = true;
      setSyntheticSpeaking(true);
    },
  });
  await Promise.race([spoken, new Promise((r) => setTimeout(r, SPEECH_TIMEOUT_MS))]);
  if (synthetic) setSyntheticSpeaking(false);
}

export function InterviewRoom(props: InterviewRoomProps) {
  const { sessionId, requestedInput } = props;
  const router = useRouter();
  const reportHref = `/interview/${sessionId}/report`;

  const [state, dispatch] = useReducer(roomReducer, { ...props, inputMode: requestedInput }, initRoom);

  // Voice needs the Web Speech API; a refresh can land here in any browser.
  const sttSupported = useSyncExternalStore(noSubscribe, isSttSupported, () => true);
  useEffect(() => {
    if (state.inputMode === "voice" && !sttSupported) {
      dispatch({
        type: "FALLBACK_TO_TYPED",
        notice: "Voice answers need Chrome or Edge, so you'll type your answers here.",
      });
    }
  }, [state.inputMode, sttSupported]);

  const voice = useVoiceAnswer({
    onText: (text) => dispatch({ type: "LIVE_TEXT", text }),
    onIdle: (hasText) =>
      dispatch(
        hasText
          ? { type: "SUBMIT" }
          : {
              type: "RECORD_CANCEL",
              notice: "We didn't hear anything. Press Start answering when you're ready.",
            },
      ),
    onFatal: (heard) =>
      dispatch({
        type: "FALLBACK_TO_TYPED",
        notice: "We lost access to your microphone, so you can type the rest of your answers.",
        draft: heard,
      }),
  });

  // ---- 1. Speaking: say the queued lines, then hand over the turn ---------
  const firstSpeech = useRef(true);
  useEffect(() => {
    if (state.phase !== "speaking") return;
    let cancelled = false;
    void (async () => {
      if (firstSpeech.current) {
        firstSpeech.current = false;
        const intro = props.turnSeq === 0 ? takeIntro(sessionId) : null;
        if (intro) {
          dispatch({ type: "INTRO", line: intro });
          return; // INTRO re-queues speech; this effect runs again for it.
        }
      }
      await sayLines(state.speech);
      if (!cancelled) dispatch({ type: "SPEECH_DONE" });
    })();
    return () => {
      cancelled = true;
    };
  }, [state.phase, state.speech, props.turnSeq, sessionId]);

  // ---- 6. Done: say the wrap line, then go to the scorecard ---------------
  useEffect(() => {
    if (state.phase !== "done") return;
    let cancelled = false;
    void (async () => {
      await sayLines(state.speech);
      if (!cancelled) router.push(reportHref);
    })();
    return () => {
      cancelled = true;
    };
  }, [state.phase, state.speech, router, reportHref]);

  // Silence everything if the candidate leaves mid-sentence.
  useEffect(() => () => stopSpeaking(), []);

  // ---- 4. Submitting: one request per SUBMIT, guarded by phase + seq ------
  const submittedSeq = useRef<number | null>(null);
  /** Timings of the last voice answer, for a retry after a failed send. */
  const lastVoiceTimings = useRef<{ holdMs: number; captureMs?: number } | null>(null);
  useEffect(() => {
    if (state.phase !== "submitting") return;
    const clientTurnSeq = state.turnSeq + 1;
    if (submittedSeq.current === clientTurnSeq) return;
    submittedSeq.current = clientTurnSeq;

    void (async () => {
      // Collect the answer: a live recording is stopped and flushed; a typed
      // answer, or a voice retry, is the draft as it stands.
      let transcript = state.draft.trim();
      let timings: { holdMs: number; captureMs?: number } = { holdMs: 0 };
      if (voice.isActive()) {
        const answer = await voice.finish();
        transcript = answer.transcript.trim();
        timings = { holdMs: answer.holdMs, captureMs: answer.captureMs };
        lastVoiceTimings.current = timings;
      } else if (state.inputMode === "voice" && lastVoiceTimings.current) {
        timings = lastVoiceTimings.current;
      }
      // Typed answers send no capture time; the server then reports wpm as
      // null rather than a made-up rate.

      if (!transcript) {
        submittedSeq.current = null;
        dispatch({
          type: "RECORD_CANCEL",
          notice: "We didn't catch any words. Press Start answering and try again.",
        });
        return;
      }

      // Covers the scoring wait (~0.3s target). Silent if clips are missing.
      playAck();

      try {
        const res = await fetch(`/api/sessions/${sessionId}/turns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, clientTurnSeq, ...timings }),
        });
        const body = await res.json().catch(() => null);

        if (res.status === 409) {
          if (body && typeof body === "object" && "state" in body) {
            dispatch({ type: "STALE" });
            router.refresh();
          } else {
            // Already finished elsewhere: the scorecard is the right place.
            router.push(reportHref);
          }
          return;
        }
        if (!res.ok) {
          submittedSeq.current = null;
          dispatch({ type: "SUBMIT_FAILED", message: friendlyError(res.status, body) });
          return;
        }

        const turn = body as TurnResponse;
        if (turn.kind === "nudge") {
          submittedSeq.current = null;
          dispatch({ type: "NUDGE", line: turn.line });
          return;
        }
        lastVoiceTimings.current = null;
        // 5. The note renders now, before the next question is spoken.
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
        submittedSeq.current = null;
        dispatch({
          type: "SUBMIT_FAILED",
          message: "We couldn't reach the server. Your answer is kept — try sending again.",
        });
      }
    })();
    // `voice` is stable in behaviour; its identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.turnSeq, state.draft, state.inputMode, sessionId, router, reportHref]);

  // ---- Controls -------------------------------------------------------------
  const onDraftChange = useCallback((text: string) => dispatch({ type: "DRAFT_CHANGED", text }), []);
  const onSubmit = useCallback(() => {
    unlockAudio();
    dispatch({ type: "SUBMIT" });
  }, []);
  const startVoice = voice.start;
  const onRecordStart = useCallback(() => {
    // Only on the candidate's turn — the machine refuses otherwise, and the
    // recognizer must not open behind a refused transition.
    if (state.phase !== "awaitingAnswer" || state.inputMode !== "voice") return;
    unlockAudio();
    dispatch({ type: "RECORD_START" });
    startVoice();
  }, [state.phase, state.inputMode, startVoice]);

  const endInterview = () => {
    voice.abort();
    stopSpeaking();
    dispatch({ type: "END" });
    router.push(reportHref);
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="sr-only">Interview in progress</h1>
        <ProgressPill progress={state.progress} />
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard"
            onClick={() => {
              voice.abort();
              stopSpeaking();
            }}
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            Continue later
          </Link>
          <EndInterviewDialog
            answered={state.turnSeq}
            disabled={state.phase === "submitting" || state.phase === "done"}
            onConfirm={endInterview}
          />
        </div>
      </div>

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <section aria-label="Interview" className="flex min-w-0 flex-col gap-6 rounded-xl border border-line bg-surface p-5 sm:p-8">
          <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
            <Avatar state={avatarState(state.phase)} readMouth={readMouth} />
            <Captions text={state.question.text} lead={state.question.lead} intro={state.intro} />
          </div>

          {state.notice && (
            <p role="status" className="rounded-lg bg-sunken px-3 py-2 text-sm text-ink">
              {state.notice}
            </p>
          )}
          {state.nudge && (
            <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-strong">
              {state.nudge}
            </p>
          )}
          {state.error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {state.error}
            </p>
          )}

          {state.phase === "resyncing" ? (
            <LoadingState label="Catching up with your interview…" className="py-8" />
          ) : state.phase === "done" ? (
            <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
              {state.wrapLine && <p className="text-base text-ink">{state.wrapLine}</p>}
              <LoadingState label="Preparing your scorecard…" className="py-2" />
            </div>
          ) : (
            <PushToTalk
              inputMode={state.inputMode}
              phase={state.phase}
              draft={state.draft}
              secondsLeft={voice.secondsLeft}
              onDraftChange={onDraftChange}
              onSubmit={onSubmit}
              onRecordStart={onRecordStart}
            />
          )}
        </section>

        <Notepad notes={state.notes} />
      </div>
    </div>
  );
}
