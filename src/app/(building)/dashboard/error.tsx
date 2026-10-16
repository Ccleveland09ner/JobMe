"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { PageContainer } from "@/components/layout/PageContainer";

export default function DashboardError({
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
        title="We couldn't load your interviews"
        message="Your data is safe. This is usually a brief connection problem."
        onRetry={() => retry()}
      />
    </PageContainer>
  );
}
