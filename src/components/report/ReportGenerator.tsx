"use client";

/**
 * First visit to a scorecard: ask the server to build the report (idempotent),
 * then hand it over (or re-render the page). A 409 (nothing answered) goes
 * back to the interview.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { buttonClasses } from "@/components/ui/Button";
import { friendlyError } from "@/lib/frontend/adapters";
import type { GeneratedReport } from "@/lib/frontend/report-document";

type Status = { kind: "generating" } | { kind: "empty" } | { kind: "error"; message: string };

export function ReportGenerator({
  sessionId,
  onGenerated,
}: {
  sessionId: string;
  /** Takes the report as written; without it the page is re-rendered. */
  onGenerated?: (report: GeneratedReport) => void;
}) {
  const router = useRouter();
  const handOver = useRef(onGenerated);
  useEffect(() => {
    handOver.current = onGenerated;
  });
  const [status, setStatus] = useState<Status>({ kind: "generating" });
  const [attempt, setAttempt] = useState(0);
  const [, startRefresh] = useTransition();
  const started = useRef(-1);

  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;

    void (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/report`, { method: "POST" });
        if (res.ok) {
          const report = (await res.json().catch(() => null)) as GeneratedReport | null;
          if (report && handOver.current) handOver.current(report);
          else startRefresh(() => router.refresh());
          return;
        }
        if (res.status === 409) {
          setStatus({ kind: "empty" });
          return;
        }
        setStatus({ kind: "error", message: friendlyError(res.status, await res.json().catch(() => null)) });
      } catch {
        setStatus({ kind: "error", message: "We couldn't reach the server. Check your connection and try again." });
      }
    })();
  }, [attempt, sessionId, router]);

  if (status.kind === "empty") {
    return (
      <EmptyState
        title="No answers yet"
        message="Answer at least one question to get a scorecard."
        action={
          <Link href={`/interview/${sessionId}`} className={buttonClasses()}>
            Back to the interview
          </Link>
        }
      />
    );
  }

  if (status.kind === "error") {
    return (
      <ErrorState
        title="We couldn't build your scorecard"
        message={status.message}
        onRetry={() => {
          setStatus({ kind: "generating" });
          setAttempt((a) => a + 1);
        }}
      >
        <Link href="/dashboard" className={buttonClasses({ variant: "secondary" })}>
          Back to dashboard
        </Link>
      </ErrorState>
    );
  }

  return <LoadingState label="Preparing your scorecard — this takes a few seconds the first time." />;
}
