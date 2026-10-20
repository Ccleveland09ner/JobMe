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
 *   2. awaitingAnswer  mic enabled; the candidate presses the mic
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
 *
 * Layout (user decision, 2026-10-18): the room is a conversation, not a
 * dashboard. Laid over the 3D room, full screen:
 *   - the interviewer's question in a speech bubble by her head;
 *   - the candidate's words in their own bubble, over the microphone at the
 *     centre bottom of the frame (PushToTalk);
 *   - the notepad lies on the table: picked up (the 3D notepad, or its
 *     "Notes" button) it opens as a notepad to flip through (HeldNotepad).
 *     It shows the same entries the always-on notepad did, no more.
 * Every effect, request and phase above is unchanged.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";

import { useBuilding } from "@/components/building/BuildingProvider";
import { domVisible } from "@/components/building/heldMachine";
import { LoadingState } from "@/components/common/LoadingState";
import { Button, buttonClasses } from "@/components/ui/Button";
import { friendlyError, noteFromResponse } from "@/lib/frontend/adapters";
import { takeIntro } from "@/lib/frontend/handoff";
import type { InputMode, NoteView, ProgressView, QuestionView, TurnResponse } from "@/lib/frontend/types";
import { readMouth, readSpokenWord, readVisemes, unlockAudio } from "@/lib/frontend/voiceSession";
import { isSttSupported } from "@/lib/voice/stt";
import type { SttErrorCode } from "@/lib/voice/sttMachine";
import { playAck, speak, stopSpeaking } from "@/lib/voice/tts";

import type { MicControl, MicState } from "./Recruiter3D";
import { RecruiterStage } from "./RecruiterStage";
import { Captions } from "./Captions";
import { EndInterviewDialog } from "./EndInterviewDialog";
import { HeldNotepad } from "./HeldNotepad";
import { ProgressPill } from "./ProgressPill";
import { PushToTalk } from "./PushToTalk";
import { avatarState, initRoom, roomReducer } from "./roomMachine";
import { SpeechBubble } from "./SpeechBubble";
import { useVoiceAnswer } from "./useVoiceAnswer";

/**
 * Why voice answers stopped, in plain words, by the recognizer's error.
 * Only fatal errors reach here (the rest restart quietly).
 */
const FALLBACK_REASON: Partial<Record<SttErrorCode, string>> = {
  "not-allowed":
    "Microphone access is blocked for this site. To use your voice, allow the microphone in the address bar's site settings and reload.",
  "service-not-allowed": "This browser's speech recognition is turned off or unavailable.",
  "audio-capture": "No working microphone was found.",
  "language-not-supported": "This browser can't recognise English speech right now.",
  unknown: "Voice answers stopped working.",
};

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
  // Both voices publish a lip-sync timeline (lib/voice/tts.ts), which the
  // recruiter's mouth and the captions read directly; nothing to set up here.
  await Promise.race([speak(text), new Promise((r) => setTimeout(r, SPEECH_TIMEOUT_MS))]);
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
              notice: "We didn't hear anything. Press the mic when you're ready.",
            },
      ),
    onFatal: (heard, reason) =>
      dispatch({
        type: "FALLBACK_TO_TYPED",
        notice: `${FALLBACK_REASON[reason ?? "unknown"] ?? FALLBACK_REASON.unknown} You can type the rest of your answers.`,
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
          notice: "We didn't catch any words. Press the mic and try again.",
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

  // The candidate's mic, as both the panel button and the 3D desk mic show it.
  const micState: MicState =
    state.inputMode !== "voice"
      ? "off"
      : state.phase === "recording"
        ? "recording"
        : state.phase === "awaitingAnswer"
          ? "ready"
          : "disabled";
  const mic = useMemo<MicControl>(
    () => ({
      state: micState,
      toggle: micState === "recording" ? onSubmit : micState === "ready" ? onRecordStart : () => {},
    }),
    [micState, onSubmit, onRecordStart],
  );

  // ---- The notepad on the table -----------------------------------------
  // In the building it is a held object (heldMachine.ts): picked up off the
  // table, then opened. Without the building, it just opens.
  const building = useBuilding();
  const dispatchHeld = building?.dispatchHeld;
  const setAction = building?.setAction;
  const [notesOpenLocally, setNotesOpenLocally] = useState(false);
  const notesOpen = building ? building.held.held === "notepad" && domVisible(building.held) : notesOpenLocally;
  const openNotes = useCallback(() => {
    if (dispatchHeld) dispatchHeld({ type: "REQUEST", want: "notepad" });
    else setNotesOpenLocally(true);
  }, [dispatchHeld]);
  const closeNotes = useCallback(() => {
    if (dispatchHeld) dispatchHeld({ type: "REQUEST", want: null });
    else setNotesOpenLocally(false);
  }, [dispatchHeld]);
  // Clicking the 3D notepad does the same as the Notes button.
  useEffect(() => {
    if (!setAction) return;
    setAction("notepad", openNotes);
    return () => setAction("notepad", null);
  }, [setAction, openNotes]);

  const endInterview = () => {
    voice.abort();
    stopSpeaking();
    dispatch({ type: "END" });
    router.push(reportHref);
  };

  const latest = state.notes.at(-1);
  const slip =
    "rounded-lg border-2 border-ink/70 px-3 py-2 text-sm shadow-[3px_4px_0_0_rgb(28_27_26/0.18)]";

  return (
    <div className="absolute inset-0">
      <h1 className="sr-only">Interview in progress</h1>

      {/* Corners: where you are, and the ways out. */}
      <div className="pointer-events-auto absolute left-3 top-3 max-w-[60vw] rounded-lg border-2 border-ink/70 bg-paper px-3 py-1.5 shadow-[3px_4px_0_0_rgb(28_27_26/0.18)]">
        <ProgressPill progress={state.progress} />
      </div>
      <div className="pointer-events-auto absolute right-3 top-3 flex flex-wrap justify-end gap-2">
        <Link
          href="/dashboard"
          onClick={() => {
            voice.abort();
            stopSpeaking();
          }}
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          Continue later
        </Link>
        <EndInterviewDialog
          answered={state.turnSeq}
          disabled={state.phase === "submitting" || state.phase === "done"}
          onConfirm={endInterview}
        />
      </div>

      {/* The interviewer's bubble, by her head; a new line pops in afresh. */}
      <section
        aria-label="Interviewer"
        className="pointer-events-auto absolute inset-x-3 top-16 mx-auto max-w-md md:left-1/2 md:right-auto md:top-[8vh] md:mx-0 md:ml-[4vw] md:w-[min(28rem,38vw)]"
      >
        <SpeechBubble key={`${state.question.text}|${state.wrapLine ?? ""}`} tail="down-left" label="Interviewer">
          {state.phase === "done" && state.wrapLine ? (
            <p aria-live="polite" className="text-xl leading-relaxed text-ink">
              {state.wrapLine}
            </p>
          ) : (
            <div className="max-h-[34vh] overflow-y-auto">
              <Captions
                text={state.question.text}
                lead={state.question.lead}
                intro={state.intro}
                spoken={state.phase === "speaking" ? state.speech.join(" ").trim() : null}
                readSpokenWord={readSpokenWord}
              />
            </div>
          )}
          <div className="mt-2">
            <RecruiterStage state={avatarState(state.phase)} readMouth={readMouth} readVisemes={readVisemes} mic={mic} />
          </div>
        </SpeechBubble>
      </section>

      {/* Passing remarks: what the room needs the candidate to know. */}
      <div className="pointer-events-auto absolute left-3 top-1/2 flex max-w-xs -translate-y-1/2 flex-col gap-2">
        {state.notice && (
          <p role="status" className={`${slip} bg-paper text-ink`}>
            {state.notice}
          </p>
        )}
        {state.nudge && (
          <p role="status" className={`${slip} bg-accent-soft text-accent-strong`}>
            {state.nudge}
          </p>
        )}
        {state.error && (
          <p role="alert" className={`${slip} bg-danger-soft text-danger`}>
            {state.error}
          </p>
        )}
      </div>

      {state.phase === "resyncing" ? (
        <div className={`pointer-events-auto absolute inset-x-0 bottom-8 mx-auto w-fit bg-paper ${slip}`}>
          <LoadingState label="Catching up with your interview…" className="py-1" />
        </div>
      ) : state.phase === "done" ? (
        <div role="status" className={`pointer-events-auto absolute inset-x-0 bottom-8 mx-auto w-fit bg-paper ${slip}`}>
          <LoadingState label="Preparing your scorecard…" className="py-1" />
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

      {/* The notepad on the table, and the button that picks it up. */}
      {state.notes.length > 0 && (
        <div className="pointer-events-auto absolute bottom-5 right-3">
          <Button variant="secondary" onClick={openNotes} disabled={notesOpen}>
            Notes ({state.notes.length})
          </Button>
        </div>
      )}
      {notesOpen && (
        <div className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center overflow-y-auto bg-ink/10 p-3">
          <HeldNotepad notes={state.notes} onClose={closeNotes} />
        </div>
      )}

      {/* Announce the gist of each new note, not eight score bars. */}
      <p aria-live="polite" className="sr-only">
        {latest
          ? `Notepad updated. ${latest.degraded ? "Scoring unavailable for this answer." : latest.observation} ${latest.reason}`
          : ""}
      </p>
    </div>
  );
}
