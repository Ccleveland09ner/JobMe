"use client";

/**
 * The tagline under the title, in quotation marks and a handwritten face
 * (Caveat) apart from the title's. Its lines are reserved before the pick, so
 * nothing below moves; then it fades in. Light on dusk and night skies, as the
 * title is (.sky-title in globals.css).
 */

import { Caveat } from "next/font/google";

import { useTagline } from "./useTagline";

const caveat = Caveat({ weight: "600", subsets: ["latin"], fallback: ["Segoe Print", "Bradley Hand", "cursive"] });

export function Tagline() {
  const tagline = useTagline();
  return (
    <p
      className={`${caveat.className} sky-title sky-tagline min-h-[3lh] max-w-[34ch] text-balance text-center leading-[1.15] text-ink sm:min-h-[2lh]`}
      style={{ fontSize: "clamp(18px, 1.9vw, 28px)" }}
    >
      {tagline && <span className="animate-tagline-in">{`“${tagline}”`}</span>}
    </p>
  );
}
