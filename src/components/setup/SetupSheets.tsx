/**
 * The setup clipboard's sheets, turned by components/setup/SetupForm.tsx:
 * one step each, with its heading, its fields, its problems and the way on.
 * Laid out at SHEET_SIZE, so each fits its sheet.
 */

import type { ReactNode } from "react";

import { LocalDate } from "@/components/common/LocalDate";
import { Button } from "@/components/ui/Button";
import { DocumentPage } from "@/components/ui/DocumentPage";
import { MODE_LABELS } from "@/lib/frontend/labels";
import { REVIEW_SHEET, resumeIdOf, SETUP_SHEETS, type SetupErrors, type SetupValues } from "@/lib/frontend/setup";
import type { InputMode, ResumeSummary } from "@/lib/frontend/types";

export const SHEET_SIZE = { width: 440, height: 640 };

export const sheetHeadingId = (sheet: number) => `setup-sheet-${sheet}`;

function Progress({ sheet }: { sheet: number }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="flex gap-1">
        {SETUP_SHEETS.map((s, i) => (
          <span key={s.id} className={`size-2 rounded-full border border-ink ${i <= sheet ? "bg-ink" : ""}`} />
        ))}
      </span>
      Sheet {sheet + 1} of {SETUP_SHEETS.length}
    </span>
  );
}

export function SetupSheet({
  sheet,
  intro,
  errors,
  attempt,
  onBack,
  onNext,
  action,
  busy = false,
  children,
}: {
  sheet: number;
  intro?: ReactNode;
  /** This sheet's problems. */
  errors: SetupErrors;
  /** Bumped on every turn refused, so the same problems are announced again. */
  attempt: number;
  onBack: () => void;
  onNext: () => void;
  /** In place of Next, on the last sheet. */
  action?: ReactNode;
  /** The interview is being created: nothing turns. */
  busy?: boolean;
  children: ReactNode;
}) {
  const problems = Object.values(errors).filter(Boolean);
  return (
    <DocumentPage
      face="paper"
      running={
        <>
          <span>Before we start</span>
          <Progress sheet={sheet} />
        </>
      }
    >
      <div data-sheet={sheet} className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={sheetHeadingId(sheet)} tabIndex={-1} className="text-xl font-bold text-ink outline-none">
            {SETUP_SHEETS[sheet].title}
          </h2>
          {intro && <p className="text-sm text-muted">{intro}</p>}
        </div>
        {/* Each field shows its own problem; this announces them. */}
        <p key={attempt} role="alert" className="sr-only">
          {problems.length ? `Before you go on: ${problems.join(" ")}` : ""}
        </p>
        <div className="flex flex-col gap-5">{children}</div>
        <div className="mt-auto flex items-center justify-between gap-3 border-t-2 border-dashed border-ink/20 pt-3">
          {sheet > 0 ? (
            <Button variant="ghost" size="sm" onClick={onBack} disabled={busy}>
              <span aria-hidden="true">←</span> Back
            </Button>
          ) : (
            <span />
          )}
          {action ?? (
            <Button onClick={onNext}>
              Next <span aria-hidden="true">→</span>
            </Button>
          )}
        </div>
      </div>
    </DocumentPage>
  );
}

function host(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** The last sheet: everything chosen, each with a way back to change it. */
export function ReviewList({
  values,
  latest,
  inputMode,
  onChange,
  busy = false,
}: {
  values: SetupValues;
  latest: ResumeSummary | null;
  inputMode: InputMode;
  onChange: (sheet: number) => void;
  busy?: boolean;
}) {
  const sheetOf = (id: (typeof SETUP_SHEETS)[number]["id"]) => SETUP_SHEETS.findIndex((s) => s.id === id);
  const { job, resume } = values;
  const resumeId = resumeIdOf(resume);
  const source =
    job.source === "paste" && job.roleText.trim()
      ? "description pasted"
      : job.source === "link" && job.jobUrl.trim()
        ? `posting on ${host(job.jobUrl.trim())}`
        : null;
  const role = [job.targetRole.trim(), job.company.trim()].filter(Boolean).join(" at ");
  const rows: { label: string; value: ReactNode; sheet: number }[] = [
    { label: "Your name", value: values.displayName.trim(), sheet: sheetOf("you") },
    {
      label: "Interview",
      value: `${MODE_LABELS[values.mode]}${values.mode === "full" && !resumeId ? ", general questions" : ""}`,
      sheet: sheetOf("you"),
    },
    {
      label: "The job",
      value: [role || null, source].filter(Boolean).join(" · ") || "Not given: general questions",
      sheet: sheetOf("job"),
    },
    {
      label: "Resume",
      value:
        resume.choice === "existing" && latest ? (
          <>
            Your resume from <LocalDate iso={latest.createdAt} />
          </>
        ) : resumeId ? (
          "The one you just uploaded"
        ) : (
          "No resume"
        ),
      sheet: sheetOf("resume"),
    },
    { label: "Answers", value: inputMode === "voice" ? "Out loud" : "Typed", sheet: sheetOf("mic") },
  ];
  return (
    <dl className="flex flex-col divide-y-2 divide-dashed divide-ink/15">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 py-2">
          <div className="flex min-w-0 flex-col">
            <dt className="text-xs text-muted">{r.label}</dt>
            <dd className="truncate text-sm font-semibold text-ink">{r.value}</dd>
          </div>
          {r.sheet < REVIEW_SHEET && (
            <Button variant="ghost" size="sm" onClick={() => onChange(r.sheet)} disabled={busy}>
              Change<span className="sr-only"> {r.label.toLowerCase()}</span>
            </Button>
          )}
        </div>
      ))}
    </dl>
  );
}
