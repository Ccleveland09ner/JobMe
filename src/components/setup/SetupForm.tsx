"use client";

/**
 * Interview setup on the desk clipboard: a few sheets, filled in one at a
 * time. Each sheet is checked before it turns (lib/frontend/setup.ts); values
 * stay put when turning back. Only Begin, on the last sheet, creates the
 * session (POST /api/sessions) while walking to the room, then opens
 * /interview/[id].
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBuilding } from "@/components/building/BuildingProvider";
import { CloseTag } from "@/components/held/Held";
import { useHeld } from "@/components/held/useHeld";
import { BookSlider, type BookSliderHandle, type BookState } from "@/components/ui/book-slider";
import { Button } from "@/components/ui/Button";
import { Clipboard, paperField } from "@/components/ui/Clipboard";
import { ScaleToFit } from "@/components/ui/ScaleToFit";
import type { InterviewMode } from "@/lib/engine/types";
import { createSession, OFFLINE_MESSAGE } from "@/lib/frontend/api";
import { saveIntro } from "@/lib/frontend/handoff";
import { useDefaults } from "@/lib/frontend/preferences";
import {
  REVIEW_SHEET,
  resumeIdOf,
  sessionBody,
  SETUP_SHEETS,
  validateSetup,
  validateSetupSheet,
  type JobValue,
  type ResumeState,
  type SetupErrors,
  type SetupValues,
} from "@/lib/frontend/setup";
import { unlockAudio } from "@/lib/frontend/voiceSession";
import type { InputMode, ResumeSummary } from "@/lib/frontend/types";
import { LIMITS } from "@/lib/schemas";

import { FieldError, JobDescriptionField } from "./JobDescriptionField";
import { MicCheck } from "./MicCheck";
import { ModeSelector } from "./ModeSelector";
import { ResumeSelector } from "./ResumeSelector";
import { ReviewList, SetupSheet, SHEET_SIZE, sheetHeadingId } from "./SetupSheets";

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
  const building = useBuilding();
  // A held object: it plays its closing before the 3D clipboard goes back.
  const { closing } = useHeld("clipboard");

  const [displayName, setDisplayName] = useState(defaultName);
  // The board's defaults start the form; a choice here wins. Preferring to type wins over a working mic.
  const defaults = useDefaults();
  const [chosenMode, setMode] = useState<InterviewMode | null>(null);
  const mode = chosenMode ?? defaults?.mode ?? "quick";
  const [resume, setResume] = useState<ResumeState>(
    latestResume ? { choice: "existing", resumeId: latestResume.id } : { choice: "none" },
  );
  const [job, setJob] = useState<JobValue>({ targetRole: "", source: "paste", roleText: "", jobUrl: "" });
  const [micMode, setInputMode] = useState<InputMode>("typed");
  const inputMode: InputMode = defaults?.inputMode === "typed" ? "typed" : micMode;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const values: SetupValues = { displayName, job, resume, mode };

  // The sheet on top, its problems, and how many turns were refused.
  const [sheet, setSheet] = useState(0);
  const [errors, setErrors] = useState<SetupErrors>({});
  const [attempt, setAttempt] = useState(0);
  const slider = useRef<BookSliderHandle>(null);
  const stack = useRef<HTMLDivElement>(null);
  // Begin sends once, whatever happens to the button.
  const sending = useRef(false);
  // One turn at a time: a second click mid-turn would skip a sheet's check.
  const turning = useRef<number | undefined>(undefined);
  // What to focus once the sheet on top, or its problems, have rendered.
  const focusNext = useRef<"heading" | "problem" | null>(null);

  const onInputModeChange = useCallback((m: InputMode) => setInputMode(m), []);

  useEffect(() => {
    const what = focusNext.current;
    focusNext.current = null;
    if (what === "heading") document.getElementById(sheetHeadingId(sheet))?.focus({ preventScroll: true });
    if (what === "problem")
      stack.current?.querySelector<HTMLElement>(`[data-sheet="${sheet}"] :is([aria-invalid="true"], [data-invalid])`)?.focus();
  }, [sheet, attempt]);
  useEffect(() => () => window.clearTimeout(turning.current), []);

  function turn(to: (s: BookSliderHandle) => void, focus: "heading" | "problem" = "heading") {
    const s = slider.current;
    if (!s || turning.current !== undefined) return;
    focusNext.current = focus;
    // Cleared when the sheet lands, or after a while if it never turns.
    turning.current = window.setTimeout(() => (turning.current = undefined), 1500);
    to(s);
  }

  function onPageChange(state: BookState) {
    window.clearTimeout(turning.current);
    turning.current = undefined;
    setSheet(state.page);
  }

  function refuse(problems: SetupErrors, at: number) {
    setErrors(problems);
    setAttempt((n) => n + 1);
    if (at === sheet) focusNext.current = "problem";
    else turn((s) => s.turnTo(at), "problem");
  }

  function next() {
    if (submitting || sheet >= REVIEW_SHEET || turning.current !== undefined) return;
    const problems = validateSetupSheet(sheet, values);
    if (Object.keys(problems).length) return refuse(problems, sheet);
    setErrors({});
    turn((s) => s.next());
  }

  function back() {
    if (submitting) return;
    setErrors({});
    turn((s) => s.prev());
  }

  function change(to: number) {
    if (submitting) return;
    setErrors({});
    turn((s) => s.turnTo(to));
  }

  async function begin() {
    if (sending.current) return;
    const problem = validateSetup(values);
    if (problem) return refuse(problem.errors, problem.sheet);
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
      const created = await createSession(sessionBody(values));
      if (!created.ok) return failed(created.offline ? OFFLINE_MESSAGE : created.message);
      const { sessionId, introLine } = created.data;
      saveIntro(sessionId, introLine);
      building?.release();
      // Stay "submitting" through navigation so Begin cannot fire again.
      router.push(`/interview/${sessionId}?input=${inputMode}`);
    } catch {
      failed(OFFLINE_MESSAGE);
    }
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

  const problemsOn = (at: number) => (at === sheet ? errors : {});

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
      <MicCheck onInputModeChange={onInputModeChange} />
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
