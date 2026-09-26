"use client";

/**
 * Client orchestrator for the live interview. Owns the phase machine and all
 * the audio wiring; every other room component is presentational.
 *
 * TODO(slice 2): typed-mode loop + notepad. TODO(slice 3): voice.
 * Ref: docs/TechDesign-JobMe-MVP.md > Interview Room (client orchestrator)
 *      docs/PRD-JobMe-MVP.md > Interview Room: Voice Loop
 *
 * Phases:
 *   speaking -> awaitingAnswer -> recording -> reviewing -> submitting
 *            -> speaking ... -> done
 *
 * The submit sequence, in this order, because the ordering IS the latency plan:
 *   1. playAck() immediately        (<= 0.3s, covers the gap)
 *   2. POST /api/sessions/[id]/turns
 *   3. render the notepad entry     (before or while the next audio plays,
 *                                    never after - PRD is explicit)
 *   4. speak(next.text)
 *   5. done -> speak the wrap line, route to ./report
 *
 * A 409 means a stale clientTurnSeq: resync from the state in the response
 * body rather than resubmitting.
 *
 * Never render raw JSON, model names or stack traces. Ref: PRD > Notepad.
 */

export function InterviewRoom() {
  return (
    <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_320px]">
      {/* TODO(slice 2): Avatar + Captions + PushToTalk + LiveTranscript */}
      {/* TODO(slice 2): Notepad (stacks under the avatar below 1024px) */}
    </div>
  );
}
