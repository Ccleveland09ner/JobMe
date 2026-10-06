/**
 * The target job: a title, then EITHER a pasted description OR a posting
 * link. The API rejects both at once (CreateSessionBody), so the toggle makes
 * that impossible to submit rather than an error to explain afterwards.
 *
 * Links are read only from Greenhouse, Lever, Ashby and SmartRecruiters
 * (lib/job-posting.ts); anything else comes back with a paste-instead
 * message, shown by the form.
 */

import { useId } from "react";

import { LIMITS } from "@/lib/schemas";

export type JobSource = "paste" | "link";

export interface JobValue {
  targetRole: string;
  source: JobSource;
  roleText: string;
  jobUrl: string;
}

const INPUT =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-muted/70";

export function JobDescriptionField({
  value,
  onChange,
}: {
  value: JobValue;
  onChange: (next: JobValue) => void;
}) {
  const id = useId();
  const set = (patch: Partial<JobValue>) => onChange({ ...value, ...patch });

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-2 text-sm font-medium text-ink">
        Target job <span className="font-normal text-muted">(optional)</span>
      </legend>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-role`} className="text-sm text-ink">
          Job title
        </label>
        <input
          id={`${id}-role`}
          type="text"
          maxLength={LIMITS.targetRole}
          value={value.targetRole}
          onChange={(e) => set({ targetRole: e.target.value })}
          placeholder="e.g. Software Engineering Intern"
          className={INPUT}
        />
      </div>

      <div role="radiogroup" aria-label="Job description source" className="flex gap-2">
        {(["paste", "link"] as const).map((s) => (
          <label
            key={s}
            className="cursor-pointer rounded-full border border-line px-3 py-1 text-sm text-ink has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent-strong has-focus-visible:outline-2 has-focus-visible:outline-accent"
          >
            <input
              type="radio"
              name={`${id}-source`}
              checked={value.source === s}
              onChange={() => set({ source: s })}
              className="sr-only"
            />
            {s === "paste" ? "Paste description" : "Link to posting"}
          </label>
        ))}
      </div>

      {value.source === "paste" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-text`} className="text-sm text-ink">
            Job description
          </label>
          <textarea
            id={`${id}-text`}
            rows={5}
            maxLength={LIMITS.roleText}
            value={value.roleText}
            onChange={(e) => set({ roleText: e.target.value })}
            aria-describedby={`${id}-count`}
            className={`${INPUT} resize-y`}
          />
          <p id={`${id}-count`} className="text-right text-xs text-muted tabular-nums">
            {value.roleText.length} / {LIMITS.roleText}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-url`} className="text-sm text-ink">
            Posting link
          </label>
          <input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            maxLength={LIMITS.jobUrl}
            value={value.jobUrl}
            onChange={(e) => set({ jobUrl: e.target.value })}
            placeholder="https://boards.greenhouse.io/…"
            aria-describedby={`${id}-url-help`}
            className={INPUT}
          />
          <p id={`${id}-url-help`} className="text-xs text-muted">
            Greenhouse, Lever, Ashby and SmartRecruiters links work. For other sites, paste the description instead.
          </p>
        </div>
      )}
    </fieldset>
  );
}
