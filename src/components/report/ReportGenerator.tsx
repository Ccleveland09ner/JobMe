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
import { generateReport, OFFLINE_MESSAGE } from "@/lib/frontend/api";
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
        const result = await generateReport(sessionId);
        if (result.ok) {
          if (result.data && handOver.current) handOver.current(result.data);
          else startRefresh(() => router.refresh());
          return;
        }
        if (result.offline) {
          setStatus({ kind: "error", message: OFFLINE_MESSAGE });
          return;
        }
        if (result.status === 409) {
          setStatus({ kind: "empty" });
          return;
        }
        setStatus({ kind: "error", message: result.message });
      } catch {
        setStatus({ kind: "error", message: OFFLINE_MESSAGE });
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
