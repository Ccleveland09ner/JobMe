"use client";

/**
 * Interview setup on the desk clipboard: a few sheets, filled in one at a
 * time. Each sheet is checked before it turns (useSheetTurner); values stay
 * put when turning back. Only Begin, on the last sheet, creates the session
 * (POST /api/sessions) while walking to the room, then opens /interview/[id]
 * (useBeginInterview).
 */

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { CloseTag } from "@/components/held/Held";
import { useHeld } from "@/components/held/useHeld";
import { BookSlider, type BookState } from "@/components/ui/book-slider";
import { Button } from "@/components/ui/Button";
import { Clipboard, paperField } from "@/components/ui/Clipboard";
import { FieldError } from "@/components/ui/Field";
import { ScaleToFit } from "@/components/ui/ScaleToFit";
import type { InterviewMode } from "@/lib/engine/types";
import { useDefaults } from "@/lib/frontend/preferences";
import {
  REVIEW_SHEET,
  resumeIdOf,
  sessionBody,
  SETUP_SHEETS,
  validateSetup,
  type JobValue,
  type ResumeState,
  type SetupValues,
} from "@/lib/frontend/setup";
import type { InputMode, ResumeSummary } from "@/lib/frontend/types";
import { LIMITS } from "@/lib/schemas";

import { JobDescriptionField } from "./JobDescriptionField";
import { MicCheck } from "./MicCheck";
import { ModeSelector } from "./ModeSelector";
import { ResumeSelector } from "./ResumeSelector";
import { ReviewList, SetupSheet, SHEET_SIZE } from "./SetupSheets";
import { useBeginInterview } from "./useBeginInterview";
import { useSheetTurner } from "./useSheetTurner";

/** Fields a turn of the sheet can't leave behind: everything but buttons and choices. */
const NOT_TEXT = new Set(["checkbox", "radio", "file", "button", "submit", "reset"]);

const describeSheet = ({ page, total }: BookState) => `Sheet ${page + 1} of ${total}: ${SETUP_SHEETS[page]?.title ?? ""}`;

export function SetupForm({
  title,
  description,
  defaultName,
  latestResume,
}: {
  /** The page heading. */
  title: string;
  description?: string;
  defaultName: string;
  latestResume: ResumeSummary | null;
}) {
  const router = useRouter();
  // A held object: it plays its closing before the 3D clipboard goes back.
  const { closing } = useHeld("clipboard");

  const [displayName, setDisplayName] = useState(defaultName);
  // The board's defaults start the form; a choice here wins.
  const defaults = useDefaults();
  const [chosenMode, setMode] = useState<InterviewMode | null>(null);
  const mode = chosenMode ?? defaults?.mode ?? "quick";
  const [resume, setResume] = useState<ResumeState>(
    latestResume ? { choice: "existing", resumeId: latestResume.id } : { choice: "none" },
  );
  const [job, setJob] = useState<JobValue>({ targetRole: "", company: "", source: "paste", roleText: "", jobUrl: "" });
  // The mic sheet decides, starting from the saved default (MicCheck).
  const [inputMode, setInputMode] = useState<InputMode>("typed");
  const values: SetupValues = { displayName, job, resume, mode };

  const { begin: beginInterview, submitting, error } = useBeginInterview();
  const { attempt, slider, stack, problemsOn, onPageChange, refuse, next, back, change } = useSheetTurner({
    values,
    busy: submitting,
  });

  const onInputModeChange = useCallback((m: InputMode) => setInputMode(m), []);

  function begin() {
    const problem = validateSetup(values);
    if (problem) return refuse(problem.errors, problem.sheet);
    void beginInterview(sessionBody(values), inputMode);
  }

  // Enter in a field turns the sheet; it never submits.
  function onKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    const target = e.target;
    if (target instanceof HTMLInputElement && !NOT_TEXT.has(target.type)) {
      e.preventDefault();
      next();
    }
  }

  const sheets = [
    <SetupSheet
      key="you"
      sheet={0}
      errors={problemsOn(0)}
      attempt={attempt}
      onBack={back}
      onNext={next}
      intro={description}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="setup-name" className="text-sm font-medium text-ink">
          What should the recruiter call you?
        </label>
        <input
          id="setup-name"
          type="text"
          maxLength={LIMITS.displayName}
          autoComplete="given-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          aria-invalid={problemsOn(0).displayName ? true : undefined}
          aria-describedby={problemsOn(0).displayName ? "setup-name-error" : undefined}
          className={paperField}
        />
        <FieldError id="setup-name-error" message={problemsOn(0).displayName} />
      </div>
      <ModeSelector value={mode} onChange={setMode} hasResume={resumeIdOf(resume) !== null} />
    </SetupSheet>,
    <SetupSheet
      key="job"
      sheet={1}
      errors={problemsOn(1)}
      attempt={attempt}
      onBack={back}
      onNext={next}
      intro="Optional. With a job, the questions lean towards it."
    >
      <JobDescriptionField value={job} onChange={setJob} errors={problemsOn(1)} />
    </SetupSheet>,
    <SetupSheet
      key="resume"
      sheet={2}
      errors={problemsOn(2)}
      attempt={attempt}
      onBack={back}
      onNext={next}
      intro="Optional. With a resume, the recruiter asks about your own work."
    >
      <ResumeSelector
        latest={latestResume}
        roleText={job.source === "paste" ? job.roleText : ""}
        value={resume}
        onChange={setResume}
        error={problemsOn(2).resume}
      />
    </SetupSheet>,
    <SetupSheet
      key="mic"
      sheet={3}
      errors={problemsOn(3)}
      attempt={attempt}
      onBack={back}
      onNext={next}
    >
      <MicCheck typedByDefault={defaults?.inputMode === "typed"} onInputModeChange={onInputModeChange} />
      <p className="text-xs text-muted">
        Your voice is transcribed by your browser; we store text, never audio. Note that Chrome&rsquo;s speech
        recognition sends audio to Google to transcribe it. Prefer not to? Type your answers instead.
      </p>
    </SetupSheet>,
    <SetupSheet
      key="review"
      sheet={REVIEW_SHEET}
      errors={problemsOn(REVIEW_SHEET)}
      attempt={attempt}
      onBack={back}
      onNext={next}
      busy={submitting}
      intro="Check your choices. Nothing is sent until you begin."
      action={
        <Button size="lg" onClick={begin} disabled={submitting}>
          {submitting ? "Starting…" : "Begin interview"}
        </Button>
      }
    >
      <ReviewList values={values} latest={latestResume} inputMode={inputMode} onChange={change} busy={submitting} />
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <p className="text-sm text-muted" aria-live="polite">
        {submitting ? "Preparing your interview. This can take a few seconds." : null}
      </p>
    </SetupSheet>,
  ];

  return (
    <form noValidate onSubmit={(e) => e.preventDefault()} onKeyDown={onKeyDown} className="w-full">
      <h1 className="sr-only">{title}</h1>
      <ScaleToFit reserveHeight={64}>
        <Clipboard
          loose
          closing={closing}
          decoration={
            <CloseTag onClick={() => router.push("/dashboard")} disabled={submitting} className="absolute right-3 top-1 z-30">
              Put the clipboard down
            </CloseTag>
          }
        >
          <div ref={stack}>
            <BookSlider
              ref={slider}
              mode="clipboard"
              pages={sheets}
              pageSize={SHEET_SIZE}
              documentKey="setup"
              label="Interview setup"
              describe={describeSheet}
              onPageChange={onPageChange}
            />
          </div>
        </Clipboard>
      </ScaleToFit>
    </form>
  );
}
