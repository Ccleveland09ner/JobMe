/**
 * Quick or Full. The lengths shown are the engine's own constants — the
 * actual cap for a Full interview is decided on the server from the resume,
 * so this states the range, never a computed number.
 */

import {
  FULL_QUESTION_CAP_MAX,
  FULL_QUESTION_CAP_MIN,
  QUICK_QUESTION_CAP,
  type InterviewMode,
} from "@/lib/engine/types";

const OPTIONS: { value: InterviewMode; title: string; body: string }[] = [
  {
    value: "quick",
    title: "Quick",
    body: `About 8 minutes, up to ${QUICK_QUESTION_CAP} questions. Fewer topics, followed up more deeply.`,
  },
  {
    value: "full",
    title: "Full",
    body: `Works through the roles and projects on your resume, most relevant first. ${FULL_QUESTION_CAP_MIN}–${FULL_QUESTION_CAP_MAX} questions depending on your resume.`,
  },
];

export function ModeSelector({
  value,
  onChange,
  hasResume,
}: {
  value: InterviewMode;
  onChange: (mode: InterviewMode) => void;
  hasResume: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium text-ink">Interview type</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer flex-col gap-1 rounded-xl border border-line bg-surface p-4 has-checked:border-accent has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-accent"
          >
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                value={o.value}
                checked={value === o.value}
                onChange={() => onChange(o.value)}
                className="accent-accent"
              />
              <span className="font-medium text-ink">{o.title}</span>
            </span>
            <span className="text-sm text-muted">{o.body}</span>
          </label>
        ))}
      </div>
      {value === "full" && !hasResume && (
        <p className="text-sm text-muted">
          Without a resume, a Full interview uses general behavioral questions instead of your experience.
        </p>
      )}
    </fieldset>
  );
}
