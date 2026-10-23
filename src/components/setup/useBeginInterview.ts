"use client";

/**
 * Begin: the session is created while the camera walks to the room (the walk
 * holds at the door), then the room opens. Sends once, whatever happens to
 * the button; a failure walks back and says why.
 */

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useBuilding } from "@/components/building/BuildingProvider";
import { useAlive } from "@/components/common/useAlive";
import { createSession, OFFLINE_MESSAGE } from "@/lib/frontend/api";
import { saveIntro } from "@/lib/frontend/handoff";
import type { InputMode } from "@/lib/frontend/types";
import { unlockAudio } from "@/lib/frontend/voiceSession";
import type { CreateSessionBody } from "@/lib/schemas";

export function useBeginInterview() {
  const router = useRouter();
  const building = useBuilding();
  const alive = useAlive();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Begin sends once, whatever happens to the button.
  const sending = useRef(false);

  async function begin(body: CreateSessionBody, inputMode: InputMode) {
    if (sending.current) return;
    sending.current = true;
    // Audio must be unlocked inside the click (a user gesture).
    unlockAudio();
    setSubmitting(true);
    setError(null);
    // Walk to the room while the session is created; the walk holds at the door.
    building?.walkTo("room", { hold: true });

    const failed = (message: string) => {
      building?.fail(message);
      setError(message);
      setSubmitting(false);
      sending.current = false;
    };
    try {
      const created = await createSession(body);
      if (!created.ok) return failed(created.offline ? OFFLINE_MESSAGE : created.message);
      const { sessionId, introLine } = created.data;
      saveIntro(sessionId, introLine);
      // Left the page meanwhile: the route change already ended the walk, and the session waits in the ledger.
      if (!alive.current) return;
      building?.release();
      // Stay "submitting" through navigation so Begin cannot fire again.
      router.push(`/interview/${sessionId}?input=${inputMode}`);
    } catch {
      failed(OFFLINE_MESSAGE);
    }
  }

  return { begin, submitting, error };
}
