/**
 * Nothing here yet — and what to do about it. Screen-specific empty states
 * compose this rather than restyling their own.
 */

import type { ReactNode } from "react";

export function EmptyState({
  title,
  message,
  action,
  headingLevel = "h2",
}: {
  title: string;
  message?: ReactNode;
  action?: ReactNode;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <Heading className="text-lg font-semibold text-ink">{title}</Heading>
      {message && <p className="max-w-md text-sm text-muted">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
