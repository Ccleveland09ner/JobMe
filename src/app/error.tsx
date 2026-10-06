"use client";

/**
 * Last-resort boundary for anything a segment boundary did not catch.
 *
 * Next 16.3: the recovery prop is `retry` (re-fetches and re-renders), not
 * the older `reset`. Ref: node_modules/next/dist/docs/.../file-conventions/error.md
 *
 * The error itself is logged, never shown: messages from a server render can
 * carry internals, and the candidate needs a way forward, not a stack.
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
