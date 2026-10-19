"use client";

/**
 * The answer controls.
 *
 * Voice (user decision, 2026-10-07):
 *   - While the interviewer speaks, the mic button is shown but DISABLED.
 *   - Then it enables: tap "Start answering" (or press Space) to record.
 *   - While recording: live transcript, and "Send" (or Space) to send at once.
 *     After IDLE_SEND_MS without a new word it sends by itself; the last
 *     IDLE_WARN_MS show a countdown so it never surprises anyone.
 *   - No review step. Once sent, it goes to the interviewer.
 *
 * Typed: the same turn-taking with a text box — disabled while the
 * interviewer speaks, then type and Send (Ctrl+Enter).
 *
 * Space is ignored on key repeat, and whenever focus is in a text field or on
 * another control, so it never hijacks typing or a focused button.
 *
 * In the room (user decision, 2026-10-18) the controls are laid out as the
 * candidate sees them: the microphone at the centre bottom of the frame, as
 * if they are speaking into it, and their own words in a speech bubble above
 * it. Typed answers are written straight into that bubble. The behaviour
 * above is unchanged; only where things sit has moved. Rendered inside the
 * room's full-screen overlay, which is positioned and click-through.
 */

import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/Button";
import type { InputMode } from "@/lib/frontend/types";

import { LiveTranscript } from "./LiveTranscript";
import { SpeechBubble } from "./SpeechBubble";
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

  const micLabel = recording ? "Send answer" : submitting ? "Sending…" : retry ? "Record a new answer" : "Start answering";
  const status = recording
    ? secondsLeft !== null
      ? draft.trim()
        ? `No new words — sending in ${secondsLeft}…`
        : `Didn't catch anything — stopping in ${secondsLeft}…`
      : "Listening… Press Space or the mic when you're done. Pausing for 10 seconds also sends."
    : phase === "speaking"
      ? "The mic turns on when the interviewer finishes."
      : yourTurn
        ? "Press the mic or Space, then speak."
        : submitting
          ? "Sending your answer…"
          : "";

  return (
    <>
      {/* What the candidate is saying, in their own bubble above the mic. */}
      {showWords && (
        <div className="pointer-events-auto absolute inset-x-3 bottom-[12.5rem] mx-auto max-w-2xl">
          <SpeechBubble tail="down" label="You">
            <div className="max-h-[22vh] overflow-y-auto">
              <LiveTranscript final={draft} interim="" bare />
            </div>
          </SpeechBubble>
        </div>
      )}

      {/* The microphone, centred in front of the candidate. */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-5 flex flex-col items-center gap-3 px-3">
        <div className="flex items-center gap-3">
          {retry && (
            <Button onClick={onSubmit}>Send again</Button>
          )}
          <button
            type="button"
            onClick={recording ? onSubmit : onRecordStart}
            disabled={!(recording || yourTurn)}
            aria-label={micLabel}
            className={`relative grid size-24 place-items-center rounded-full border-[3px] border-ink shadow-[0_6px_0_-1px_var(--color-ink)] transition-[transform,background-color] duration-150 not-disabled:hover:-translate-y-0.5 not-disabled:active:translate-y-0.5 disabled:cursor-not-allowed motion-reduce:transform-none ${
              recording ? "bg-danger text-white" : yourTurn ? "bg-accent text-white" : "bg-clipmetal text-ink/50"
            }`}
          >
            {recording && (
              <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full border-4 border-danger/60 motion-reduce:hidden" />
            )}
            {/* A desk microphone, drawn in ink. */}
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2.5" width="6" height="12" rx="3" fill="currentColor" fillOpacity={recording ? 0.25 : 0} />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v4M8.5 21.5h7" />
            </svg>
          </button>
        </div>
        <p
          aria-live="polite"
          className={`min-h-5 rounded-lg border-2 border-ink/70 bg-paper px-3 py-1 text-center text-xs text-ink shadow-[3px_4px_0_0_rgb(28_27_26/0.18)] ${status ? "" : "invisible"}`}
        >
          <span className="font-semibold">{micLabel}.</span> {status}
        </p>
      </div>
    </>
  );
}
