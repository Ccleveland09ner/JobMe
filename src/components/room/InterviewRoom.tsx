"use client";

/**
 * Client orchestrator for the live interview. Owns the phase machine
 * (roomMachine.ts) and the network calls; every other room component is
 * presentational.
 * Ref: docs/TechDesign-JobMe-MVP.md > Interview Room (client orchestrator)
 *      docs/PRD-JobMe-MVP.md > Interview Room: Voice Loop
 *
 * The submit sequence, in this order, because the ordering IS the latency plan:
 *   1. playAck() immediately        (TODO(voice): <= 0.3s, covers the gap)
 *   2. POST /api/sessions/[id]/turns
 *   3. render the notepad entry     (before the next audio, never after)
 *   4. speak(lead + next.text)      (TODO(voice): resolves instantly today)
 *   5. done -> wrap line, route to ./report
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
import { useCallback, useEffect, useReducer, useRef } from "react";

import { LoadingState } from "@/components/common/LoadingState";
import { buttonClasses } from "@/components/ui/Button";
import { friendlyError, noteFromResponse } from "@/lib/frontend/adapters";
import { takeIntro } from "@/lib/frontend/handoff";
import type { InputMode, NoteView, ProgressView, QuestionView, TurnResponse } from "@/lib/frontend/types";

import { Avatar } from "./Avatar";
import { Captions } from "./Captions";
import { EndInterviewDialog } from "./EndInterviewDialog";
import { Notepad } from "./Notepad";
import { ProgressPill } from "./ProgressPill";
import { PushToTalk } from "./PushToTalk";
import { avatarState, initRoom, roomReducer } from "./roomMachine";

/**
 * Voice answers are gated off until the recognizer and TTS are wired into
 * this component. Until then every interview runs the typed loop, which
 * uses the same engine and the same notepad. TODO(voice).
 */
const VOICE_ENABLED = false;

/** Pause on the wrap line before moving to the scorecard. */
const WRAP_PAUSE_MS = 1500;

export interface InterviewRoomProps {
  sessionId: string;
  question: QuestionView;
  turnSeq: number;
  progress: ProgressView;
  notes: NoteView[];
  /** What setup chose; may be downgraded to typed here. */
  requestedInput: InputMode;
}

export function InterviewRoom(props: InterviewRoomProps) {
  const { sessionId, requestedInput } = props;
  const router = useRouter();
  const inputMode: InputMode = VOICE_ENABLED ? requestedInput : "typed";

  const [state, dispatch] = useReducer(roomReducer, { ...props, inputMode }, initRoom);
  const firstSpeech = useRef(true);
  const reportHref = `/interview/${sessionId}/report`;

  // Speaking: play the queued lines, then hand the turn to the candidate.
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
      // TODO(voice): await speak(state.speech.join(" "), { signal }) from
      // lib/voice/tts.ts, with the avatar mouth fed by audio-graph readMouth().
      if (!cancelled) dispatch({ type: "SPEECH_DONE" });
    })();
    return () => {
      cancelled = true;
    };
  }, [state.phase, state.speech, props.turnSeq, sessionId]);

  // Done: let the wrap line land, then go to the scorecard, which generates
  // the report on first visit.
  useEffect(() => {
    if (state.phase !== "done") return;
    // TODO(voice): await speak(wrapLine) instead of a fixed pause.
    const timer = setTimeout(() => router.push(reportHref), state.wrapLine ? WRAP_PAUSE_MS : 0);
    return () => clearTimeout(timer);
  }, [state.phase, state.wrapLine, router, reportHref]);

  // Submitting: one request per SUBMIT, guarded by the machine's phase.
  const submittedSeq = useRef<number | null>(null);
  useEffect(() => {
    if (state.phase !== "submitting") return;
    const clientTurnSeq = state.turnSeq + 1;
    if (submittedSeq.current === clientTurnSeq) return;
    submittedSeq.current = clientTurnSeq;
    // TODO(voice): playAck() here, before the request.

    void (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/turns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: state.draft.trim(),
            // Typed answers have no talk-button hold and no capture time;
            // the server then reports wpm as null rather than a fake rate.
            holdMs: 0,
            clientTurnSeq,
          }),
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
        dispatch({
          type: "TURN_OK",
          note: noteFromResponse(turn.notepad),
          next: turn.next ? { text: turn.next.text, type: turn.next.type, topic: turn.next.topic, source: turn.next.source, lead: turn.next.lead } : null,
          done: turn.done,
          wrapLine: turn.wrapLine ?? null,
          progress: turn.progress,
        });
      } catch {
        submittedSeq.current = null;
        dispatch({
          type: "SUBMIT_FAILED",
          message: "We couldn't reach the server. Your answer is still here — try submitting again.",
        });
      }
    })();
  }, [state.phase, state.turnSeq, state.draft, sessionId, router, reportHref]);

  const onDraftChange = useCallback((text: string) => dispatch({ type: "DRAFT_CHANGED", text }), []);
  const onSubmit = useCallback(() => dispatch({ type: "SUBMIT" }), []);
  // TODO(voice): start/stop createRecognizer() from lib/voice/stt.ts here and
  // send its transcript with RECORD_STOP, plus holdMs and captureMs on submit.
  const onRecordStart = useCallback(() => dispatch({ type: "RECORD_START" }), []);
  const onRecordStop = useCallback(() => dispatch({ type: "RECORD_STOP", transcript: "" }), []);
  const onRerecord = useCallback(() => dispatch({ type: "RERECORD" }), []);

  const answered = state.turnSeq;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="sr-only">Interview in progress</h1>
        <ProgressPill progress={state.progress} />
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            Continue later
          </Link>
          <EndInterviewDialog
            answered={answered}
            disabled={state.phase === "submitting" || state.phase === "done"}
            onConfirm={() => {
              dispatch({ type: "END" });
              router.push(reportHref);
            }}
          />
        </div>
      </div>

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <section aria-label="Interview" className="flex min-w-0 flex-col gap-6 rounded-xl border border-line bg-surface p-5 sm:p-8">
          <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
            <Avatar state={avatarState(state.phase)} mouth={0} />
            <Captions text={state.question.text} lead={state.question.lead} intro={state.intro} />
          </div>

          {requestedInput === "voice" && !VOICE_ENABLED && (
            <p className="rounded-lg bg-sunken px-3 py-2 text-sm text-muted">
              Voice answers aren&rsquo;t switched on yet, so you&rsquo;ll type your answers for now. The interview and the
              notepad work the same.
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
              inputMode={inputMode}
              phase={state.phase}
              draft={state.draft}
              onDraftChange={onDraftChange}
              onSubmit={onSubmit}
              onRecordStart={onRecordStart}
              onRecordStop={onRecordStop}
              onRerecord={onRerecord}
            />
          )}
        </section>

        <Notepad notes={state.notes} />
      </div>
    </div>
  );
}
