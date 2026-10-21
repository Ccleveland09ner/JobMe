/**
 * The target job: a title, then a pasted description or a posting link
 * (never both). Links are read only from supported boards (lib/job-posting.ts).
 */

import { useId } from "react";

import { paperArea, paperField } from "@/components/ui/Clipboard";
import type { JobValue, SetupErrors } from "@/lib/frontend/setup";
import { LIMITS } from "@/lib/schemas";

export type { JobSource, JobValue } from "@/lib/frontend/setup";

// Written on the desk clipboard: a ruled line per field, ruled paper for the posting.
const INPUT = paperField;

export function JobDescriptionField({
  value,
  onChange,
  errors = {},
}: {
  value: JobValue;
  onChange: (next: JobValue) => void;
  errors?: Pick<SetupErrors, "targetRole" | "roleText" | "jobUrl">;
}) {
  const id = useId();
  const set = (patch: Partial<JobValue>) => onChange({ ...value, ...patch });
  const describedBy = (...ids: (string | false)[]) => ids.filter(Boolean).join(" ") || undefined;

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
          aria-invalid={errors.targetRole ? true : undefined}
          aria-describedby={describedBy(!!errors.targetRole && `${id}-role-error`)}
          className={INPUT}
        />
        <FieldError id={`${id}-role-error`} message={errors.targetRole} />
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
            rows={6}
            maxLength={LIMITS.roleText}
            value={value.roleText}
            onChange={(e) => set({ roleText: e.target.value })}
            aria-invalid={errors.roleText ? true : undefined}
            aria-describedby={describedBy(`${id}-count`, !!errors.roleText && `${id}-text-error`)}
            className={`${paperArea} resize-none`}
          />
          <p id={`${id}-count`} className="text-right text-xs text-muted tabular-nums">
            {value.roleText.length} / {LIMITS.roleText}
          </p>
          <FieldError id={`${id}-text-error`} message={errors.roleText} />
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
            aria-invalid={errors.jobUrl ? true : undefined}
            aria-describedby={describedBy(!!errors.jobUrl && `${id}-url-error`, `${id}-url-help`)}
            className={INPUT}
          />
          <FieldError id={`${id}-url-error`} message={errors.jobUrl} />
          <p id={`${id}-url-help`} className="text-xs text-muted">
            Greenhouse, Lever, Ashby and SmartRecruiters links work. For other sites, paste the description instead.
          </p>
        </div>
      )}
    </fieldset>
  );
}

/** A field's problem, under it; the sheet announces them together. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm font-medium text-danger">
      {message}
    </p>
  );
}
