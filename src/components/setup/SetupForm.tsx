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
 * TODO(voice): create the AudioContext here, inside the Begin click —
 * browsers only allow it from a user gesture (lib/voice/audio-graph.ts).
 */

import { useRouter } from "next/navigation";
import { useCallback, useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { InterviewMode } from "@/lib/engine/types";
import { friendlyError } from "@/lib/frontend/adapters";
import { saveIntro } from "@/lib/frontend/handoff";
import type { CreateSessionResponse, InputMode, ResumeSummary } from "@/lib/frontend/types";
import { LIMITS } from "@/lib/schemas";

import { JobDescriptionField, type JobValue } from "./JobDescriptionField";
import { MicCheck } from "./MicCheck";
import { ModeSelector } from "./ModeSelector";
import { ResumeSelector } from "./ResumeSelector";

export function SetupForm({
  defaultName,
  latestResume,
}: {
  defaultName: string;
  latestResume: ResumeSummary | null;
}) {
  const router = useRouter();
  const id = useId();

  const [displayName, setDisplayName] = useState(defaultName);
  const [mode, setMode] = useState<InterviewMode>("quick");
  const [resumeId, setResumeId] = useState<string | null>(latestResume?.id ?? null);
  const [job, setJob] = useState<JobValue>({ targetRole: "", source: "paste", roleText: "", jobUrl: "" });
  const [inputMode, setInputMode] = useState<InputMode>("typed");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onInputModeChange = useCallback((m: InputMode) => setInputMode(m), []);

  async function begin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const roleText = job.source === "paste" ? job.roleText.trim() : "";
    const jobUrl = job.source === "link" ? job.jobUrl.trim() : "";
    const body = {
      displayName: displayName.trim(),
      mode,
      ...(job.targetRole.trim() && { targetRole: job.targetRole.trim() }),
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
        setError(friendlyError(res.status, data));
        setSubmitting(false);
        return;
      }
      const created = data as CreateSessionResponse;
      saveIntro(created.sessionId, created.introLine);
      // Stay "submitting" through navigation so Begin cannot double-fire.
      router.push(`/interview/${created.sessionId}?input=${inputMode}`);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={begin} className="flex flex-col gap-6" aria-describedby={error ? `${id}-error` : undefined}>
      <Card className="flex flex-col gap-6">
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
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink"
          />
        </div>

        <ModeSelector value={mode} onChange={setMode} hasResume={resumeId !== null} />
      </Card>

      <Card className="flex flex-col gap-6">
        <ResumeSelector latest={latestResume} roleText={job.source === "paste" ? job.roleText : ""} onChange={setResumeId} />
        <JobDescriptionField value={job} onChange={setJob} />
      </Card>

      <Card className="flex flex-col gap-4">
        <MicCheck onInputModeChange={onInputModeChange} />
        <p className="border-t border-line pt-4 text-xs text-muted">
          Your voice is transcribed by your browser; we store text, never audio. Note that Chrome&rsquo;s
          speech recognition sends audio to Google to transcribe it. Prefer not to? Type your answers instead.
        </p>
      </Card>

      {error && (
        <p id={`${id}-error`} role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        <p className="text-sm text-muted" aria-live="polite">
          {submitting ? "Preparing your interview — this can take a few seconds." : null}
        </p>
        <Button type="submit" size="lg" disabled={submitting || !displayName.trim()}>
          {submitting ? "Starting…" : "Begin interview"}
        </Button>
      </div>
    </form>
  );
}
