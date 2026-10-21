/**
 * A speech bubble with a tail toward the speaker ("down-left": the
 * interviewer, "down": the candidate). Re-key it to pop in a new line.
 */

import type { ReactNode } from "react";

export function SpeechBubble({
  tail,
  label,
  className = "",
  children,
}: {
  tail: "down-left" | "down";
  /** Visible speaker tag: "Interviewer", "You". */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const tailAt = tail === "down" ? "left-1/2 -translate-x-1/2" : "left-10";
  return (
    <div
      className={`bubble-in relative rounded-[1.6rem] border-[3px] border-ink bg-paper px-5 pb-4 pt-3 shadow-[5px_7px_0_0_rgb(28_27_26/0.22)] ${
        tail === "down" ? "origin-bottom" : "origin-bottom-left"
      } ${className}`}
    >
      <p aria-hidden="true" className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted">
        {label}
      </p>
      {children}
      {/* The tail: a corner of paper, ink on its two outer sides. */}
      <span
        aria-hidden="true"
        className={`absolute -bottom-[11px] size-5 rotate-45 border-b-[3px] border-r-[3px] border-ink bg-paper ${tailAt}`}
      />
    </div>
  );
}
