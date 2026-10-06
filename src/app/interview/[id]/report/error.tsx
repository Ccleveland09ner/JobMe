"use client";

import Link from "next/link";
import { useEffect } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { PageContainer } from "@/components/layout/PageContainer";
import { buttonClasses } from "@/components/ui/Button";

export default function ReportError({
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
    <PageContainer width="narrow">
      <ErrorState
        title="We couldn't load your scorecard"
        message="Your interview is saved. This is usually a brief connection problem."
        onRetry={() => retry()}
      >
        <Link href="/dashboard" className={buttonClasses({ variant: "secondary" })}>
          Back to dashboard
        </Link>
      </ErrorState>
    </PageContainer>
  );
}
