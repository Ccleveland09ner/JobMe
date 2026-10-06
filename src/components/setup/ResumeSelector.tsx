"use client";

/**
 * Which resume the interview draws on: the latest one on file, a new upload,
 * or none.
 *
 * Upload goes to the real POST /api/resume (multipart `file`, plus the pasted
 * job description as `roleText` so the coverage list is ranked against it).
 * The PDF is parsed and discarded server-side; only redacted text is kept.
 *
 * `layoutSuspect` is a hard requirement from the resume pipeline: a flattened
 * two-column PDF parses into plausible nonsense that only the candidate can
 * spot, so the extracted text must be confirmed before the resume is used.
 */

import { useId, useState } from "react";

import { LocalDate } from "@/components/common/LocalDate";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { friendlyError } from "@/lib/frontend/adapters";
import type { ResumeSummary, ResumeUploadResponse } from "@/lib/frontend/types";

type Choice = "existing" | "upload" | "none";

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
}: {
  latest: ResumeSummary | null;
  /** Pasted job description at upload time, for coverage ranking. */
  roleText: string;
  /** The resume id to use, or null for none / not ready yet. */
  onChange: (resumeId: string | null) => void;
}) {
  const id = useId();
  const [choice, setChoice] = useState<Choice>(latest ? "existing" : "none");
  const [upload, setUpload] = useState<Upload>({ status: "idle" });

  function choose(next: Choice) {
    setChoice(next);
    if (next === "existing") onChange(latest?.id ?? null);
    else if (next === "upload") onChange(upload.status === "ready" ? upload.result.resumeId : null);
    else onChange(null);
  }

  async function uploadFile(file: File) {
    setUpload({ status: "uploading" });
    onChange(null);
    const form = new FormData();
    form.append("file", file);
    if (roleText.trim()) form.append("roleText", roleText.trim());
    try {
      const res = await fetch("/api/resume", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setUpload({ status: "error", message: friendlyError(res.status, body) });
        return;
      }
      const result = body as ResumeUploadResponse;
      if (result.layoutSuspect) {
        setUpload({ status: "review", result });
      } else {
        setUpload({ status: "ready", result });
        onChange(result.resumeId);
      }
    } catch {
      setUpload({ status: "error", message: "We couldn't upload that file. Check your connection and try again." });
    }
  }

  const items =
    upload.status === "ready" || upload.status === "review"
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
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 font-mono text-xs text-ink">
                {upload.result.extractedPreview}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setUpload({ status: "ready", result: upload.result });
                    onChange(upload.result.resumeId);
                  }}
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
