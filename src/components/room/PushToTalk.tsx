"use client";

/**
 * The answer controls. Voice: the mic is disabled while the interviewer
 * speaks; press it (or Space) to record and again to send, or it sends after
 * IDLE_SEND_MS of silence. Typed: a text box, Ctrl+Enter to send.
 */

import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/Button";
import type { InputMode } from "@/lib/frontend/types";

import { LiveTranscript } from "./LiveTranscript";
import { SpeechBubble } from "./SpeechBubble";
import { TableMic } from "./TableMic";
import type { Phase } from "./roomMachine";

/** True when a key event belongs to something the user is typing into or operating. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName);
}

export function PushToTalk({
  inputMode,
  phase,
  draft,
  secondsLeft,
  onDraftChange,
  onSubmit,
  onRecordStart,
}: {
  inputMode: InputMode;
  phase: Phase;
  draft: string;
  /** Idle countdown, only inside the warning window. */
  secondsLeft: number | null;
  onDraftChange: (text: string) => void;
  onSubmit: () => void;
  onRecordStart: () => void;
}) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const yourTurn = phase === "awaitingAnswer";
  const recording = phase === "recording";
  const submitting = phase === "submitting";

  // Typed mode: put the caret in the box when it is the candidate's turn.
  useEffect(() => {
    if (inputMode === "typed" && yourTurn) textarea.current?.focus();
  }, [inputMode, yourTurn]);

  // Voice mode: Space starts recording on your turn, and sends while recording.
  useEffect(() => {
    if (inputMode !== "voice") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isTypingTarget(e.target)) return;
      if (yourTurn) {
        e.preventDefault();
        onRecordStart();
      } else if (recording) {
        e.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inputMode, yourTurn, recording, onRecordStart, onSubmit]);

  if (inputMode === "typed") {
    return (
      <div className="pointer-events-auto absolute inset-x-3 bottom-5 mx-auto max-w-2xl">
        <SpeechBubble tail="down" label="You">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            <label htmlFor={`${id}-answer`} className="sr-only">
              Your answer
            </label>
            <textarea
              id={`${id}-answer`}
              ref={textarea}
              rows={4}
              value={draft}
              disabled={!yourTurn}
              placeholder={yourTurn ? "Type your answer…" : undefined}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              aria-describedby={`${id}-hint`}
              className="max-h-[30vh] w-full resize-y rounded-lg border-2 border-ink/30 bg-transparent p-2 text-base leading-relaxed text-ink placeholder:text-muted/60 focus:border-accent disabled:opacity-60"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p id={`${id}-hint`} className="text-xs text-muted">
                {phase === "speaking" ? "The interviewer is speaking…" : "Answer as you would out loud. Ctrl+Enter to send."}
              </p>
              <Button type="submit" disabled={!yourTurn || !draft.trim()}>
                {submitting ? "Sending…" : "Send"}
              </Button>
            </div>
          </form>
        </SpeechBubble>
      </div>
    );
  }

  // A send failed: the transcript is kept, so it can go again as-is.
  const retry = yourTurn && draft.trim().length > 0;
  const showWords = recording || submitting || retry;

  const status = recording
    ? secondsLeft !== null
      ? draft.trim()
        ? `No new words — sending in ${secondsLeft}…`
        : `Didn't catch anything — stopping in ${secondsLeft}…`
      : "Listening… Press the mic or Space to send. Pausing for 10 seconds also sends."
    : submitting
      ? "Sending your answer…"
      : phase === "speaking"
        ? "The interviewer is speaking. The mic turns on when they finish."
        : yourTurn
          ? retry
            ? "Press the mic to record a new answer, or send this one again."
            : "Press the mic or Space, then speak."
          : "";

  return (
    <>
      {/* What the candidate is saying, in their own bubble above the mic. */}
      {showWords && (
        <div className="pointer-events-auto absolute inset-x-3 bottom-[15.5rem] mx-auto max-w-2xl">
          <SpeechBubble tail="down" label="You">
            <div className="max-h-[22vh] overflow-y-auto">
              <LiveTranscript final={draft} interim="" bare />
            </div>
          </SpeechBubble>
        </div>
      )}

      {/* The mic, centred in front of the candidate: press to start, again to send. */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-3 flex flex-col items-center gap-1 px-3">
        <div className="flex items-center gap-3">
          <TableMic
            state={recording ? "recording" : yourTurn ? "ready" : "disabled"}
            onToggle={recording ? onSubmit : onRecordStart}
          />
          {retry && <Button onClick={onSubmit}>Send again</Button>}
        </div>
        <p
          aria-live="polite"
          className={`min-h-5 rounded-lg border-2 border-ink/70 bg-paper px-3 py-1 text-center text-xs text-ink shadow-[3px_4px_0_0_rgb(28_27_26/0.18)] ${status ? "" : "invisible"}`}
        >
          {status}
        </p>
      </div>
    </>
  );
}
