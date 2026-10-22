/** Indeterminate activity; decorative (the text beside it says what's happening). */

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-4 animate-spin rounded-full border-2 border-line border-t-accent ${className}`.trim()}
    />
  );
}
