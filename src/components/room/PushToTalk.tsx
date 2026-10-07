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
 */

import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/Button";
import type { InputMode } from "@/lib/frontend/types";

import { LiveTranscript } from "./LiveTranscript";
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
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor={`${id}-answer`} className="text-sm font-medium text-ink">
          Your answer
        </label>
        <textarea
          id={`${id}-answer`}
          ref={textarea}
          rows={6}
          value={draft}
          disabled={!yourTurn}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit();
            }
          }}
          aria-describedby={`${id}-hint`}
          className="w-full resize-y rounded-lg border border-line bg-surface p-3 text-base leading-relaxed text-ink disabled:bg-sunken"
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
    );
  }

  // A send failed: the transcript is kept, so it can go again as-is.
  const retry = yourTurn && draft.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      {(recording || submitting || retry) && <LiveTranscript final={draft} interim="" />}

      <div className="flex flex-col items-center gap-2">
        {recording ? (
          <>
            <p className="flex items-center gap-2 text-sm font-medium text-accent-strong">
              <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-danger" />
              Listening…
            </p>
            <Button size="lg" onClick={onSubmit} className="min-w-56">
              Send answer
            </Button>
            <p aria-live="polite" className="min-h-5 text-xs text-muted">
              {secondsLeft !== null
                ? draft.trim()
                  ? `No new words — sending in ${secondsLeft}…`
                  : `Didn't catch anything — stopping in ${secondsLeft}…`
                : "Press Space or Send when you're done. Pausing for 10 seconds also sends."}
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap justify-center gap-2">
              {retry && (
                <Button size="lg" onClick={onSubmit}>
                  Send again
                </Button>
              )}
              <Button
                size="lg"
                variant={retry ? "secondary" : "primary"}
                onClick={onRecordStart}
                disabled={!yourTurn}
                className="min-w-56"
              >
                {submitting ? "Sending…" : retry ? "Record a new answer" : "Start answering"}
              </Button>
            </div>
            <p className="min-h-5 text-xs text-muted">
              {phase === "speaking"
                ? "The mic turns on when the interviewer finishes."
                : yourTurn
                  ? "Press Start answering or Space, then speak."
                  : null}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
