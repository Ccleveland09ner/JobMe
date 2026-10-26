"use client";

/** The preferences note: interview type, answer mode, lobby music and the receptionist's voice, saved in this browser. */

import { useId, useState } from "react";

import { FULL_QUESTION_CAP_MAX, FULL_QUESTION_CAP_MIN, QUICK_QUESTION_CAP } from "@/lib/engine/types";
import {
  FALLBACK_DEFAULTS,
  useDefaults,
  useLobbyMusic,
  useReceptionistVoice,
  writeDefaults,
  writeLobbyMusic,
  writeReceptionistVoice,
  type InterviewDefaults,
} from "@/lib/frontend/preferences";

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

const MUSIC: Option<"on" | "off">[] = [
  { value: "on", label: "On", hint: "quietly, in the lobby" },
  { value: "off", label: "Off", hint: "no music" },
];

const VOICE: Option<"on" | "off">[] = [
  { value: "on", label: "On", hint: "her words show too" },
  { value: "off", label: "Off", hint: "her words only" },
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
  const music = useLobbyMusic();
  const voice = useReceptionistVoice();
  const [status, setStatus] = useState<string>("");

  const saved = (ok: boolean) => setStatus(ok ? "Saved on this device." : "This browser wouldn't save it (private browsing?).");
  const save = (next: InterviewDefaults) => saved(writeDefaults(next));

  return (
    <div className="flex flex-col gap-3">
      <Choice legend="Interview type" options={TYPES} value={defaults.mode} onChange={(mode) => save({ ...defaults, mode })} />
      <Choice
        legend="How you answer"
        options={ANSWERS}
        value={defaults.inputMode}
        onChange={(inputMode) => save({ ...defaults, inputMode })}
      />
      <Choice legend="Lobby music" options={MUSIC} value={music ? "on" : "off"} onChange={(v) => saved(writeLobbyMusic(v === "on"))} />
      <Choice
        legend="Ms. Crystal's voice"
        options={VOICE}
        value={voice ? "on" : "off"}
        onChange={(v) => saved(writeReceptionistVoice(v === "on"))}
      />
      <p role="status" className="text-xs text-muted">
        {status || "The setup clipboard starts with your interview type and answers. Any interview can still change them."}
      </p>
    </div>
  );
}
