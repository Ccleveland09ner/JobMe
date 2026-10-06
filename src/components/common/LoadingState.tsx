/**
 * Loading placeholder. `role="status"` announces the label once, politely.
 */

import { Spinner } from "@/components/ui/Spinner";

export function LoadingState({
  label = "Loading…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-3 py-16 text-sm text-muted ${className}`.trim()}
    >
      <Spinner />
      <span>{label}</span>
    </div>
  );
}
