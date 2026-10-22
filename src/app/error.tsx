"use client";

/**
 * Last-resort error boundary. The error is logged, never shown.
 * Next 16.3 names the recovery prop `retry`, not `reset`.
 */

import Link from "next/link";
import { useEffect } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { PageContainer } from "@/components/layout/PageContainer";
import { buttonClasses } from "@/components/ui/Button";

export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="flex flex-1 flex-col">
      <PageContainer width="narrow">
        <ErrorState onRetry={() => retry()}>
          <Link href="/dashboard" className={buttonClasses({ variant: "secondary" })}>
            Back to dashboard
          </Link>
        </ErrorState>
      </PageContainer>
    </main>
  );
}
