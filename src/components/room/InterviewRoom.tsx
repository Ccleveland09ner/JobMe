"use client";

/**
 * The live interview's orchestrator: owns the phase machine (roomMachine.ts)
 * and wires the candidate's voice (useVoiceAnswer), the interviewer's
 * (useRoomSpeech) and the sending of answers (useTurnSubmission); the other
 * room components are presentational. A 409 with `state` means a stale turn:
 * the page re-renders from the server's history.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useReducer } from "react";

import { LoadingState } from "@/components/common/LoadingState";
import { useBrowserValue } from "@/components/common/useBrowserValue";
import { Button, buttonClasses } from "@/components/ui/Button";
import type { InputMode, NoteView, ProgressView, QuestionView } from "@/lib/frontend/types";
import { readMouth, readSpokenWord, readVisemes, unlockAudio } from "@/lib/frontend/voiceSession";
import { isSttSupported } from "@/lib/voice/stt";
import type { SttErrorCode } from "@/lib/voice/sttMachine";
import { stopSpeaking } from "@/lib/voice/tts";

import type { MicControl } from "./types";
import { RecruiterStage } from "./RecruiterStage";
import { Captions } from "./Captions";
import { EndInterviewDialog } from "./EndInterviewDialog";
import { HeldNotepad } from "./HeldNotepad";
import { ProgressPill } from "./ProgressPill";
import { PushToTalk } from "./PushToTalk";
import { avatarState, initRoom, micStateFor, roomReducer } from "./roomMachine";
import { SpeechBubble } from "./SpeechBubble";
import { useNotepadHold } from "./useNotepadHold";
import { useRoomSpeech } from "./useRoomSpeech";
import { useTurnSubmission } from "./useTurnSubmission";
import { useVoiceAnswer } from "./useVoiceAnswer";

/** Why voice answers stopped, by the recognizer's fatal error. */
const FALLBACK_REASON: Partial<Record<SttErrorCode, string>> = {
  "not-allowed":
    "Microphone access is blocked for this site. To use your voice, allow the microphone in the address bar's site settings and reload.",
  "service-not-allowed": "This browser's speech recognition is turned off or unavailable.",
  "audio-capture": "No working microphone was found.",
  "language-not-supported": "This browser can't recognise English speech right now.",
  unknown: "Voice answers stopped working.",
};

export interface InterviewRoomProps {
  sessionId: string;
  question: QuestionView;
  turnSeq: number;
  progress: ProgressView;
  notes: NoteView[];
  /** What setup chose. Voice falls back to typed if the browser cannot do it. */
  requestedInput: InputMode;
}

export function InterviewRoom(props: InterviewRoomProps) {
  const { sessionId, requestedInput } = props;
  const router = useRouter();
  const reportHref = `/interview/${sessionId}/report`;

  const [state, dispatch] = useReducer(roomReducer, { ...props, inputMode: requestedInput }, initRoom);

  // Voice needs the Web Speech API; a refresh can land here in any browser.
  const sttSupported = useBrowserValue(isSttSupported, true);
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

  useRoomSpeech({ phase: state.phase, speech: state.speech, openedAt: props.turnSeq, sessionId, reportHref, dispatch });
  useTurnSubmission({
    phase: state.phase,
    turnSeq: state.turnSeq,
    draft: state.draft,
    inputMode: state.inputMode,
    sessionId,
    reportHref,
    dispatch,
    voiceActive: voice.isActive,
    finishVoice: voice.finish,
    greeting: state.greeting !== null,
  });

  // Controls.
  const onDraftChange = useCallback((text: string) => dispatch({ type: "DRAFT_CHANGED", text }), []);
  const onSubmit = useCallback(() => {
    unlockAudio();
    dispatch({ type: "SUBMIT" });
  }, []);
  const startVoice = voice.start;
  const onRecordStart = useCallback(() => {
    // Only on the candidate's turn, so the recognizer never opens behind a refused transition.
    if (state.phase !== "awaitingAnswer" || state.inputMode !== "voice") return;
    unlockAudio();
    dispatch({ type: "RECORD_START" });
    startVoice();
  }, [state.phase, state.inputMode, startVoice]);

  const micState = micStateFor(state.inputMode, state.phase);
  const mic = useMemo<MicControl>(
    () => ({
      state: micState,
      toggle: micState === "recording" ? onSubmit : micState === "ready" ? onRecordStart : () => {},
    }),
    [micState, onSubmit, onRecordStart],
  );

  const { open: notesOpen, openNotes, closeNotes } = useNotepadHold();

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
        <SpeechBubble key={`${state.greeting?.line ?? state.question.text}|${state.wrapLine ?? ""}`} tail="down-left" label="Interviewer">
          {state.phase === "done" && state.wrapLine ? (
            <p aria-live="polite" className="text-xl leading-relaxed text-ink">
              {state.wrapLine}
            </p>
          ) : (
            <div className="max-h-[34vh] overflow-y-auto">
              {/* The greeting stands alone; question 1 waits until it is answered. */}
              <Captions
                text={state.greeting?.line ?? state.question.text}
                lead={state.greeting ? null : state.question.lead}
                intro={state.greeting ? null : state.intro}
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
        <div className={`pointer-events-auto absolute inset-x-0 bottom-8 mx-auto w-fit bg-paper ${slip}`}>
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
          ? `Notepad updated. ${latest.degraded ? "Not scored yet." : latest.observation} ${latest.reason}`
          : ""}
      </p>
    </div>
  );
}
