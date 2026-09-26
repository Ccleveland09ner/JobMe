"use client";

/**
 * Hold to talk. Pointer or Space. Doubles as the typed-mode input.
 *
 * TODO(slice 3): implement.
 * Ref: docs/PRD-JobMe-MVP.md > Interview Room: Voice Loop
 *      docs/TechDesign-JobMe-MVP.md > Components > Interview Room
 *
 * Push-to-talk, deliberately NOT voice-activity detection: no false triggers,
 * no interruption bugs, which are the usual live-demo failures.
 * Ref: PRD > Product Decisions
 *
 * Two keyboard details that will bite otherwise:
 *   - ignore key repeat on Space held down
 *   - ignore Space entirely while focus is inside a textarea
 *
 * On release: show the transcript with Submit / Re-record.
 * In typed mode the button becomes a text box, same engine, same notepad.
 */

export function PushToTalk() {
  return <div>{/* TODO(slice 3) */}</div>;
}
