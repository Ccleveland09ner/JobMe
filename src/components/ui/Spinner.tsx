/**
 * Indeterminate activity. Decorative — the surrounding text says what is
 * happening, so this is hidden from assistive tech.
 */

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-4 animate-spin rounded-full border-2 border-line border-t-accent ${className}`.trim()}
    />
  );
}
