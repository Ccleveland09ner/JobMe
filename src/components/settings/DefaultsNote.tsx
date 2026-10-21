"use client";

/**
 * "Interview defaults", written on its note on the settings board: the
 * interview type and answer mode the setup clipboard starts with. Saved in
 * this browser as soon as they change (lib/frontend/preferences.ts); every
 * interview can still choose otherwise.
 *
 * Compact — it has to fit a note — but ordinary radio groups underneath.
 */

import { useId, useState } from "react";

import { FULL_QUESTION_CAP_MAX, FULL_QUESTION_CAP_MIN, QUICK_QUESTION_CAP } from "@/lib/engine/types";
import { FALLBACK_DEFAULTS, useDefaults, writeDefaults, type InterviewDefaults } from "@/lib/frontend/preferences";

interface Option<V extends string> {
  value: V;
  label: string;
  hint: string;
}

const TYPES: Option<InterviewDefaults["mode"]>[] = [
  { value: "quick", label: "Quick", hint: `~8 min, up to ${QUICK_QUESTION_CAP} questions` },
  { value: "full", label: "Full", hint: `${FULL_QUESTION_CAP_MIN}–${FULL_QUESTION_CAP_MAX} questions, from your resume` },
];

const ANSWERS: Option<InterviewDefaults["inputMode"]>[] = [
  { value: "voice", label: "Speak", hint: "into the microphone" },
  { value: "typed", label: "Type", hint: "in a text box" },
];

function Choice<V extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: Option<V>[];
  value: V;
  onChange: (value: V) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer flex-col rounded-lg border-2 border-ink/25 bg-paper/70 px-2.5 py-1.5 has-checked:border-accent has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-accent"
          >
            <span className="flex items-center gap-1.5 font-semibold text-ink">
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={value === o.value}
                onChange={() => onChange(o.value)}
                className="accent-accent"
              />
              {o.label}
            </span>
            <span className="text-xs leading-snug text-muted">{o.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DefaultsNote() {
  const defaults = useDefaults() ?? FALLBACK_DEFAULTS;
  const [status, setStatus] = useState<string>("");

  const save = (next: InterviewDefaults) => {
    setStatus(writeDefaults(next) ? "Saved on this device." : "This browser wouldn't save it (private browsing?).");
  };

  return (
    <div className="flex flex-col gap-3">
      <Choice legend="Interview type" options={TYPES} value={defaults.mode} onChange={(mode) => save({ ...defaults, mode })} />
      <Choice
        legend="How you answer"
        options={ANSWERS}
        value={defaults.inputMode}
        onChange={(inputMode) => save({ ...defaults, inputMode })}
      />
      <p role="status" className="text-xs text-muted">
        {status || "The setup clipboard starts with these. Any interview can still change them."}
      </p>
    </div>
  );
}
