"use client";

/**
 * "Interview defaults": the interview type and answer mode the setup
 * clipboard starts with. Saved in this browser as soon as they change
 * (lib/frontend/preferences.ts); every interview can still choose otherwise.
 */

import { useId, useState } from "react";

import { ModeSelector } from "@/components/setup/ModeSelector";
import type { InterviewMode } from "@/lib/engine/types";
import { FALLBACK_DEFAULTS, useDefaults, writeDefaults, type InterviewDefaults } from "@/lib/frontend/preferences";
import type { InputMode } from "@/lib/frontend/types";

const ANSWER_MODES: { value: InputMode; title: string; body: string }[] = [
  { value: "voice", title: "Speak", body: "Answer out loud into the microphone. Falls back to typing if the mic isn't available." },
  { value: "typed", title: "Type", body: "Answer in a text box." },
];

export function DefaultsNote() {
  const id = useId();
  const defaults = useDefaults() ?? FALLBACK_DEFAULTS;
  const [status, setStatus] = useState<string>("");

  const save = (next: InterviewDefaults) => {
    setStatus(writeDefaults(next) ? "Saved on this device." : "This browser wouldn't save it (private browsing?).");
  };

  return (
    <div className="flex flex-col gap-6">
      <ModeSelector value={defaults.mode} onChange={(mode: InterviewMode) => save({ ...defaults, mode })} hasResume />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium text-ink">How you answer</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {ANSWER_MODES.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer flex-col gap-1 rounded-xl border border-line bg-surface p-4 has-checked:border-accent has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-accent"
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-answer`}
                  value={o.value}
                  checked={defaults.inputMode === o.value}
                  onChange={() => save({ ...defaults, inputMode: o.value })}
                  className="accent-accent"
                />
                <span className="font-medium text-ink">{o.title}</span>
              </span>
              <span className="text-sm text-muted">{o.body}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <p role="status" className="text-sm text-muted">
        {status || "These pre-fill the setup clipboard. You can still change them for any interview."}
      </p>
    </div>
  );
}
