"use client";

/**
 * Setup form: name, interview type, resume, target job, mic check, Begin.
 * Ref: docs/PRD-JobMe-MVP.md > Interview Setup
 *
 * Begin -> POST /api/sessions -> /interview/[id]?input=typed|voice.
 *
 * The create response's `introLine` is handed to the room through
 * sessionStorage, keyed by session id. It is a nicety: if storage is
 * unavailable the room simply opens on the first question.
 *
 * Begin also unlocks audio (unlockAudio): the AudioContext and the ack clips
 * must start inside a user gesture (lib/voice/audio-graph.ts).
 */

import { useRouter } from "next/navigation";
import { useCallback, useId, useState } from "react";

import { useBuilding } from "@/components/building/BuildingProvider";
import { Button } from "@/components/ui/Button";
import { Clipboard, paperField } from "@/components/ui/Clipboard";
import type { InterviewMode } from "@/lib/engine/types";
import { friendlyError } from "@/lib/frontend/adapters";
import { saveIntro } from "@/lib/frontend/handoff";
import { useDefaults } from "@/lib/frontend/preferences";
import { unlockAudio } from "@/lib/frontend/voiceSession";
import type { CreateSessionResponse, InputMode, ResumeSummary } from "@/lib/frontend/types";
import { LIMITS } from "@/lib/schemas";

import { JobDescriptionField, type JobValue } from "./JobDescriptionField";
import { MicCheck } from "./MicCheck";
import { ModeSelector } from "./ModeSelector";
import { ResumeSelector } from "./ResumeSelector";

export function SetupForm({
  title,
  description,
  defaultName,
  latestResume,
}: {
  /** The page heading, written at the top of the clipboard. */
  title: string;
  description?: string;
  defaultName: string;
  latestResume: ResumeSummary | null;
}) {
  const router = useRouter();
  const building = useBuilding();
  const id = useId();

  const [displayName, setDisplayName] = useState(defaultName);
  // Defaults pinned on the settings board (preferences.ts) start the form;
  // a choice made here wins. A preference for typing wins over a working
  // microphone (MicCheck only ever reports what the mic can do).
  const defaults = useDefaults();
  const [chosenMode, setMode] = useState<InterviewMode | null>(null);
  const mode = chosenMode ?? defaults?.mode ?? "quick";
  const [resumeId, setResumeId] = useState<string | null>(latestResume?.id ?? null);
  const [job, setJob] = useState<JobValue>({ targetRole: "", company: "", source: "paste", roleText: "", jobUrl: "" });
  const [micMode, setInputMode] = useState<InputMode>("typed");
  const inputMode: InputMode = defaults?.inputMode === "typed" ? "typed" : micMode;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onInputModeChange = useCallback((m: InputMode) => setInputMode(m), []);

  async function begin(e: React.FormEvent) {
    e.preventDefault();
    // Inside the click: browsers only start audio from a user gesture, and the
    // recruiter speaks the first question as soon as the room opens.
    unlockAudio();
    setSubmitting(true);
    setError(null);
    // Down the corridor to the interview room while the session is created:
    // the walk holds at the room door until the request is done.
    building?.walkTo("room", { hold: true });

    const roleText = job.source === "paste" ? job.roleText.trim() : "";
    const jobUrl = job.source === "link" ? job.jobUrl.trim() : "";
    const body = {
      displayName: displayName.trim(),
      mode,
      ...(job.targetRole.trim() && { targetRole: job.targetRole.trim() }),
      ...(job.company.trim() && { company: job.company.trim() }),
      ...(roleText && { roleText }),
      ...(jobUrl && { jobUrl }),
      ...(resumeId && { resumeId }),
    };

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = friendlyError(res.status, data);
        building?.fail(message);
        setError(message);
        setSubmitting(false);
        return;
      }
      const created = data as CreateSessionResponse;
      saveIntro(created.sessionId, created.introLine);
      building?.release();
      // Stay "submitting" through navigation so Begin cannot double-fire.
      router.push(`/interview/${created.sessionId}?input=${inputMode}`);
    } catch {
      const message = "We couldn't reach the server. Check your connection and try again.";
      building?.fail(message);
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={begin} aria-describedby={error ? `${id}-error` : undefined}>
      <Clipboard paperClassName="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-medium text-ink">
            What should the recruiter call you?
          </label>
          <input
            id={`${id}-name`}
            type="text"
            required
            maxLength={LIMITS.displayName}
            autoComplete="given-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={paperField}
          />
        </div>

        <ModeSelector value={mode} onChange={setMode} hasResume={resumeId !== null} />

        <div className="flex flex-col gap-6 border-t-2 border-dashed border-ink/20 pt-6">
          <ResumeSelector latest={latestResume} roleText={job.source === "paste" ? job.roleText : ""} onChange={setResumeId} />
          <JobDescriptionField value={job} onChange={setJob} />
        </div>

        <div className="flex flex-col gap-4 border-t-2 border-dashed border-ink/20 pt-6">
          <MicCheck onInputModeChange={onInputModeChange} />
          <p className="text-xs text-muted">
            Your voice is transcribed by your browser; we store text, never audio. Note that Chrome&rsquo;s
            speech recognition sends audio to Google to transcribe it. Prefer not to? Type your answers instead.
          </p>
        </div>

        {error && (
          <p id={`${id}-error`} role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse items-stretch gap-3 border-t-2 border-dashed border-ink/20 pt-6 sm:flex-row sm:items-center sm:justify-end">
          <p className="text-sm text-muted" aria-live="polite">
            {submitting ? "Preparing your interview — this can take a few seconds." : null}
          </p>
          <Button type="submit" size="lg" disabled={submitting || !displayName.trim()}>
            {submitting ? "Starting…" : "Begin interview"}
          </Button>
        </div>
      </Clipboard>
    </form>
  );
}
