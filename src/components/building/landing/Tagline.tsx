"use client";

/**
 * The tagline under the title. Its lines are reserved before the pick, so
 * nothing below moves; then it fades in. Light on dusk and night skies, as
 * the title is (.sky-title in globals.css).
 */

import { useTagline } from "./useTagline";

export function Tagline() {
  const tagline = useTagline();
  return (
    <p
      className="sky-title sky-tagline min-h-[3lh] max-w-[34ch] text-balance text-center font-bold leading-snug text-ink sm:min-h-[2lh]"
      style={{ fontSize: "clamp(1rem, 1.6vh + 0.6vw, 1.45rem)" }}
    >
      {tagline && <span className="animate-tagline-in">{tagline}</span>}
    </p>
  );
}
