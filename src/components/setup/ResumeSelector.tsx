"use client";

/**
 * Which resume the interview uses: the latest on file, a new upload, or none.
 * A suspect layout (e.g. two columns) must be confirmed before use. Reports
 * the choice with how far an upload has got, so the sheet can hold until it
 * is ready.
 */

import { useId, useRef, useState } from "react";

import { LocalDate } from "@/components/common/LocalDate";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { uploadResume } from "@/lib/frontend/api";
import type { ResumeState } from "@/lib/frontend/setup";
import type { ResumeSummary, ResumeUploadResponse } from "@/lib/frontend/types";

import { FieldError } from "./JobDescriptionField";

type Choice = ResumeState["choice"];

type Upload =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "error"; message: string }
  | { status: "review"; result: ResumeUploadResponse }
  | { status: "ready"; result: ResumeUploadResponse };

export function ResumeSelector({
  latest,
  roleText,
  onChange,
  error,
}: {
  latest: ResumeSummary | null;
  /** Pasted job description at upload time, for coverage ranking. */
  roleText: string;
  onChange: (state: ResumeState) => void;
  /** Why the sheet can't turn yet. */
  error?: string;
}) {
  const id = useId();
  const [choice, setChoice] = useState<Choice>(latest ? "existing" : "none");
  const [upload, setUploadState] = useState<Upload>({ status: "idle" });
  // An upload can finish after the choice has moved on.
  const chosen = useRef(choice);

  function report(next: Choice, state: Upload) {
    if (next === "existing" && latest) onChange({ choice: "existing", resumeId: latest.id });
    else if (next === "upload")
      onChange({ choice: "upload", status: state.status, resumeId: state.status === "ready" ? state.result.resumeId : null });
    else onChange({ choice: "none" });
  }

  function choose(next: Choice) {
    setChoice(next);
    chosen.current = next;
    report(next, upload);
  }

  function setUpload(state: Upload) {
    setUploadState(state);
    if (chosen.current === "upload") report("upload", state);
  }

  async function uploadFile(file: File) {
    setUpload({ status: "uploading" });
    const form = new FormData();
    form.append("file", file);
    if (roleText.trim()) form.append("roleText", roleText.trim());
    const offline = "We couldn't upload that file. Check your connection and try again.";
    try {
      const uploaded = await uploadResume(form);
      if (!uploaded.ok) {
        setUpload({ status: "error", message: uploaded.offline ? offline : uploaded.message });
        return;
      }
      const result = uploaded.data;
      setUpload({ status: result.layoutSuspect ? "review" : "ready", result });
    } catch {
      setUpload({ status: "error", message: offline });
    }
  }

  const items =
    choice === "upload" && upload.status === "ready"
      ? upload.result.coverage
      : choice === "existing"
        ? (latest?.items ?? [])
        : [];

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium text-ink">
        Resume <span className="font-normal text-muted">(optional)</span>
      </legend>

      <div className="flex flex-col gap-2">
        {latest && (
          <Option name={id} checked={choice === "existing"} onSelect={() => choose("existing")}>
            Use my resume from <LocalDate iso={latest.createdAt} />
          </Option>
        )}
        <Option name={id} checked={choice === "upload"} onSelect={() => choose("upload")}>
          Upload {latest ? "a new" : "a"} resume (PDF)
        </Option>
        <Option name={id} checked={choice === "none"} onSelect={() => choose("none")}>
          No resume
        </Option>
      </div>

      {choice === "upload" && (
        <div className="flex flex-col gap-2 rounded-lg bg-sunken p-4">
          <label htmlFor={`${id}-file`} className="text-sm text-ink">
            PDF, under 4MB
          </label>
          <input
            id={`${id}-file`}
            type="file"
            accept="application/pdf,.pdf"
            disabled={upload.status === "uploading"}
            aria-invalid={error && upload.status !== "review" ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file);
            }}
            className="text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
          />
          <div aria-live="polite" className="text-sm">
            {upload.status === "uploading" && (
              <p className="flex items-center gap-2 text-muted">
                <Spinner /> Reading your resume… this can take a few seconds.
              </p>
            )}
            {upload.status === "error" && <p className="text-danger">{upload.message}</p>}
            {upload.status === "ready" && <p className="text-score-4">Resume ready.</p>}
          </div>

          {upload.status === "review" && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-ink">
                This PDF&rsquo;s layout was hard to read. Check that the text below matches your resume before
                using it.
              </p>
              <pre
                tabIndex={0}
                aria-label="Text read from your resume"
                className="max-h-24 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 font-mono text-xs text-ink"
              >
                {upload.result.extractedPreview}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  data-invalid={error ? "" : undefined}
                  onClick={() => setUpload({ status: "ready", result: upload.result })}
                >
                  This looks right
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setUpload({ status: "idle" })}>
                  Upload a different file
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <FieldError id={`${id}-error`} message={error} />

      {items.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted">The interview can draw on:</p>
          <ul className="flex flex-wrap gap-1.5">
            {items.map((item, i) => (
              <li key={`${item.label}-${i}`} className="rounded-full bg-sunken px-2.5 py-0.5 text-xs text-ink">
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </fieldset>
  );
}

function Option({
  name,
  checked,
  onSelect,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="accent-accent" />
      <span>{children}</span>
    </label>
  );
}
