"use client";

import { useState } from "react";

import { Avatar, type AvatarProps } from "@/components/room/Avatar";
import { Captions } from "@/components/room/Captions";
import { RecruiterStage } from "@/components/room/RecruiterStage";
import { Button } from "@/components/ui/Button";
import { readMouth, readSpokenWord, readVisemes, unlockAudio } from "@/lib/frontend/voiceSession";
import { speak, stopSpeaking } from "@/lib/voice/tts";

const STATES: AvatarProps["state"][] = ["speaking", "idle", "listening", "thinking"];

/** A line with every kind of mouth shape: closed lips, rounded lips, teeth on lip, open vowels. */
const TEST_LINE =
  "Thanks for making the time. Tell me about a project where you owned the outcome, and what you would do differently.";

export function RecruiterPreview({ initial }: { initial: AvatarProps["state"] }) {
  const [state, setState] = useState<AvatarProps["state"]>(initial);
  const [talking, setTalking] = useState(false);

  async function sayTestLine() {
    unlockAudio(); // inside the click, as the interview does on Begin
    setTalking(true);
    setState("speaking");
    await speak(TEST_LINE);
    setTalking(false);
    setState("idle");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Recruiter state" className="flex flex-wrap gap-2">
          {STATES.map((s) => (
            <Button
              key={s}
              role="radio"
              aria-checked={state === s}
              variant={state === s ? "primary" : "secondary"}
              size="sm"
              onClick={() => setState(s)}
              disabled={talking}
            >
              {s}
            </Button>
          ))}
        </div>
        {talking ? (
          <Button size="sm" variant="secondary" onClick={() => stopSpeaking()}>
            Stop
          </Button>
        ) : (
          <Button size="sm" onClick={() => void sayTestLine()}>
            Speak a test line
          </Button>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface p-6">
          <h2 className="self-start text-sm font-semibold text-muted">3D recruiter (in the room)</h2>
          <RecruiterStage state={state} readMouth={readMouth} readVisemes={readVisemes} />
        </section>
        <section className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface p-6">
          <h2 className="self-start text-sm font-semibold text-muted">SVG recruiter (fallback)</h2>
          <Avatar state={state} readMouth={readMouth} />
        </section>
      </div>

      <section className="rounded-xl border border-line bg-surface p-6">
        <Captions text={TEST_LINE} spoken={talking ? TEST_LINE : null} readSpokenWord={readSpokenWord} />
      </section>
    </div>
  );
}
