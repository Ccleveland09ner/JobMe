/**
 * A speech bubble: who is talking, drawn like everything else in the
 * building — paper, an ink edge, a flat offset shadow — with a tail toward
 * the speaker.
 *
 *   tail "down-left"  the interviewer's bubble, its tail toward her face
 *   tail "down"       the candidate's own bubble, its tail toward the
 *                     microphone in front of them
 *
 * Re-keyed by the caller when the speech changes, so each new line pops in
 * (globals.css: bubble-in). The content keeps its own semantics; the bubble
 * is presentation.
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
