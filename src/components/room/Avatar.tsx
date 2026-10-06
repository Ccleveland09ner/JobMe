/**
 * The recruiter. Inline SVG, flat 2D illustrated person.
 * Ref: docs/PRD-JobMe-MVP.md > Look and Feel
 *      docs/TechDesign-JobMe-MVP.md > Look and Feel (Motion)
 *
 * PLACEHOLDER ARTWORK. State and mouth are wired so the room can drive it
 * today; the illustration itself is a visual-pass item (see
 * design/mock Inteview session.png for the intended style).
 *
 * TODO(visual pass): blink every 3-6s, nod on listening start. Mouth opening
 * = smoothed RMS from the AnalyserNode (lib/voice/audio-graph.ts readMouth).
 * Under prefers-reduced-motion: mouth only, no nod — the global reduced-motion
 * rule in globals.css already collapses transitions.
 */

export interface AvatarProps {
  state: "idle" | "listening" | "thinking" | "speaking";
  /** 0..1 mouth openness. */
  mouth: number;
}

const STATE_TEXT: Record<AvatarProps["state"], string> = {
  idle: "Recruiter is waiting for your answer",
  listening: "Recruiter is listening",
  thinking: "Recruiter is thinking",
  speaking: "Recruiter is speaking",
};

export function Avatar({ state, mouth }: AvatarProps) {
  const open = Math.max(0, Math.min(1, mouth));
  return (
    <figure className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 120 120" aria-hidden="true" className="size-28 sm:size-36">
        <circle cx="60" cy="60" r="58" className="fill-accent-soft" />
        {/* shoulders */}
        <path d="M22 118c4-22 20-32 38-32s34 10 38 32z" className="fill-ink" />
        <path d="M50 88l10 10 10-10" className="fill-surface" />
        {/* head */}
        <circle cx="60" cy="52" r="24" className="fill-surface stroke-ink" strokeWidth="2.5" />
        <path d="M37 46c2-14 12-20 23-20s21 6 23 20c-6-6-14-8-23-8s-17 2-23 8z" className="fill-ink" />
        {/* eyes */}
        <circle cx="51" cy="52" r="2.5" className="fill-ink" />
        <circle cx="69" cy="52" r="2.5" className="fill-ink" />
        {/* mouth: height follows `mouth` */}
        <ellipse cx="60" cy="64" rx="6" ry={1 + open * 4} className="fill-ink transition-[ry] duration-75" />
        {state === "thinking" && (
          <g className="fill-muted">
            <circle cx="88" cy="28" r="3" />
            <circle cx="96" cy="20" r="2" />
          </g>
        )}
      </svg>
      <figcaption className="text-xs text-muted" aria-live="polite">
        {STATE_TEXT[state]}
      </figcaption>
    </figure>
  );
}
