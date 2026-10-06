/**
 * Something failed. Always friendly copy written by us — callers pass a
 * message through `friendlyError()` first, never a raw API body or stack.
 */

import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";

export function ErrorState({
  title = "Something went wrong",
  message = "Please try again in a moment.",
  onRetry,
  retryLabel = "Try again",
  children,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Extra actions, e.g. a link back to the dashboard. */
  children?: ReactNode;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="max-w-md text-sm text-muted">{message}</p>
      {(onRetry || children) && (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {onRetry && <Button onClick={onRetry}>{retryLabel}</Button>}
          {children}
        </div>
      )}
    </div>
  );
}
