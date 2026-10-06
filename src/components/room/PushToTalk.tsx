"use client";

/**
 * The answer input. Typed mode is a textarea; voice mode is hold-to-talk
 * (pointer or Space) followed by Submit / Re-record.
 * Ref: docs/PRD-JobMe-MVP.md > Interview Room: Voice Loop
 *      docs/TechDesign-JobMe-MVP.md > Components > Interview Room
 *
 * Push-to-talk, deliberately NOT voice-activity detection: no false triggers,
 * no interruption bugs, which are the usual live-demo failures.
 *
 * Space handling, the two details that bite otherwise:
 *   - key repeat while Space is held must not restart recording
 *   - Space typed inside a text field, or on a focused button, is not a
 *     talk key
 *
 * Voice mode renders and handles keys today, but the room does not enable it
 * until the recognizer is wired. TODO(voice).
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
  return ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName);
}

export function PushToTalk({
  inputMode,
  phase,
  draft,
  interim = "",
  onDraftChange,
  onSubmit,
  onRecordStart,
  onRecordStop,
  onRerecord,
}: {
  inputMode: InputMode;
  phase: Phase;
  draft: string;
  interim?: string;
  onDraftChange: (text: string) => void;
  onSubmit: () => void;
  onRecordStart: () => void;
  onRecordStop: () => void;
  onRerecord: () => void;
}) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const canAnswer = phase === "awaitingAnswer" || phase === "reviewing";
  const submitting = phase === "submitting";

  // Typed mode: put the caret in the box when it is the candidate's turn.
  useEffect(() => {
    if (inputMode === "typed" && phase === "awaitingAnswer") textarea.current?.focus();
  }, [inputMode, phase]);

  // Voice mode: Space to talk, anywhere except inside a control.
  const recording = phase === "recording";
  useEffect(() => {
    if (inputMode !== "voice") return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isTypingTarget(e.target)) return;
      if (phase !== "awaitingAnswer") return;
      e.preventDefault();
      onRecordStart();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !recording) return;
      e.preventDefault();
      onRecordStop();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [inputMode, phase, recording, onRecordStart, onRecordStop]);

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
          disabled={!canAnswer}
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
            Answer as you would out loud. Ctrl+Enter to submit.
          </p>
          <Button type="submit" disabled={!canAnswer || !draft.trim()}>
            {submitting ? "Submitting…" : "Submit answer"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <LiveTranscript final={draft} interim={interim} />
      {phase === "reviewing" ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onRerecord}>
            Re-record
          </Button>
          <Button onClick={onSubmit}>Submit answer</Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Button
            size="lg"
            aria-pressed={recording}
            disabled={!(phase === "awaitingAnswer" || recording)}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              if (phase === "awaitingAnswer") onRecordStart();
            }}
            onPointerUp={() => recording && onRecordStop()}
            onPointerCancel={() => recording && onRecordStop()}
            // Keyboard users on the button itself: Enter toggles.
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (recording) onRecordStop();
              else if (phase === "awaitingAnswer") onRecordStart();
            }}
            className="min-w-56"
          >
            {recording ? "Listening… release to stop" : "Hold to talk"}
          </Button>
          <p className="text-xs text-muted">
            Or hold <kbd className="rounded border border-line px-1 font-mono">Space</kbd>
          </p>
        </div>
      )}
    </div>
  );
}
