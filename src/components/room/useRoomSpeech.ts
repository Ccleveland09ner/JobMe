"use client";

/**
 * The interviewer's voice in the room: says the queued lines, then hands over
 * the turn; at the end says the wrap line, then goes to the scorecard.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, type Dispatch } from "react";

import { takeIntro } from "@/lib/frontend/handoff";
import { speak, stopSpeaking } from "@/lib/voice/tts";

import type { Phase, RoomEvent } from "./roomMachine";

/** Upper bound on any one spoken line, so a stuck audio path can never stall the room. */
const SPEECH_TIMEOUT_MS = 30_000;

/** Says the lines; always resolves, whichever audio path (or none) worked. */
async function sayLines(lines: string[]): Promise<void> {
  const text = lines.join(" ").trim();
  if (!text) return;
  await Promise.race([speak(text), new Promise((r) => setTimeout(r, SPEECH_TIMEOUT_MS))]);
}

export function useRoomSpeech({
  phase,
  speech,
  openedAt,
  sessionId,
  reportHref,
  dispatch,
}: {
  phase: Phase;
  speech: string[];
  /** The turn the page opened at: the intro is only ever said before the first answer. */
  openedAt: number;
  sessionId: string;
  reportHref: string;
  dispatch: Dispatch<RoomEvent>;
}) {
  const router = useRouter();

  // Speaking: say the queued lines, then hand over the turn.
  const firstSpeech = useRef(true);
  useEffect(() => {
    if (phase !== "speaking") return;
    let cancelled = false;
    void (async () => {
      if (firstSpeech.current) {
        firstSpeech.current = false;
        const intro = openedAt === 0 ? takeIntro(sessionId) : null;
        if (intro) {
          dispatch({ type: "INTRO", line: intro.line, greeting: intro.greeting });
          return; // INTRO re-queues speech; this effect runs again for it.
        }
      }
      await sayLines(speech);
      if (!cancelled) dispatch({ type: "SPEECH_DONE" });
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, speech, openedAt, sessionId, dispatch]);

  // Done: say the wrap line, then go to the scorecard.
  useEffect(() => {
    if (phase !== "done") return;
    let cancelled = false;
    void (async () => {
      await sayLines(speech);
      if (!cancelled) router.push(reportHref);
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, speech, router, reportHref]);

  // Silence everything if the candidate leaves mid-sentence.
  useEffect(() => () => stopSpeaking(), []);
}
