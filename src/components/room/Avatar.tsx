"use client";

/**
 * The recruiter. Inline SVG, flat 2D illustrated person.
 * Ref: docs/PRD-JobMe-MVP.md > Look and Feel
 *      docs/TechDesign-JobMe-MVP.md > Look and Feel (Motion)
 *
 * PLACEHOLDER ARTWORK — the illustration is a visual-pass item (see
 * design/mock Inteview session.png for the intended style).
 *
 * The mouth follows the voice while speaking: `readMouth` (the audio graph's
 * smoothed RMS) is polled every animation frame and written straight to the
 * SVG through a ref, so lip-sync never re-renders React 60 times a second.
 * With no audio graph (e.g. a reload straight into the room) it falls back to
 * a gentle synthetic motion.
 *
 * Reduced motion: the mouth still moves (it carries "who is talking"), but
 * capped; the thinking dots do not animate.
 * TODO(visual pass): blink every 3-6s, nod on listening start.
 */

import { useEffect, useRef } from "react";

import { prefersReducedMotion } from "@/lib/voice/audio-graph";

export interface AvatarProps {
  state: "idle" | "listening" | "thinking" | "speaking";
  /** Live mouth openness 0..1, or null when no audio signal is available. */
  readMouth?: () => number | null;
}

const STATE_TEXT: Record<AvatarProps["state"], string> = {
  idle: "Waiting for your answer",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

const MOUTH_REST = 1;
const MOUTH_RANGE = 5;

export function Avatar({ state, readMouth }: AvatarProps) {
  const mouth = useRef<SVGEllipseElement>(null);

  useEffect(() => {
    const el = mouth.current;
    if (!el) return;
    if (state !== "speaking") {
      el.setAttribute("ry", String(MOUTH_REST));
      return;
    }
    const reduced = prefersReducedMotion();
    let raf = 0;
    const frame = () => {
      const live = readMouth?.() ?? null;
      const open =
        live !== null && live > 0.02
          ? live
          : 0.25 + 0.25 * Math.abs(Math.sin(performance.now() / 120));
      const capped = reduced ? Math.min(open, 0.4) : open;
      el.setAttribute("ry", (MOUTH_REST + capped * MOUTH_RANGE).toFixed(2));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      el.setAttribute("ry", String(MOUTH_REST));
    };
  }, [state, readMouth]);

  return (
    <figure className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 120 120" aria-hidden="true" className="size-28 sm:size-36">
        <circle cx="60" cy="60" r="58" className={state === "listening" ? "fill-accent-soft stroke-accent" : "fill-accent-soft"} strokeWidth={3} />
        {/* shoulders */}
        <path d="M22 118c4-22 20-32 38-32s34 10 38 32z" className="fill-ink" />
        <path d="M50 88l10 10 10-10" className="fill-surface" />
        {/* head */}
        <circle cx="60" cy="52" r="24" className="fill-surface stroke-ink" strokeWidth="2.5" />
        <path d="M37 46c2-14 12-20 23-20s21 6 23 20c-6-6-14-8-23-8s-17 2-23 8z" className="fill-ink" />
        {/* eyes */}
        <circle cx="51" cy="52" r="2.5" className="fill-ink" />
        <circle cx="69" cy="52" r="2.5" className="fill-ink" />
        {/* mouth: driven by the effect above while speaking */}
        <ellipse ref={mouth} cx="60" cy="64" rx="6" ry={MOUTH_REST} className="fill-ink" />
        {state === "thinking" && (
          <g className="fill-muted motion-safe:animate-pulse">
            <circle cx="88" cy="28" r="3" />
            <circle cx="96" cy="20" r="2" />
          </g>
        )}
      </svg>
      {/* Not a live region: phase changes are already announced through the
          captions and the answer controls, and repeating them here is noise. */}
      <figcaption className="text-xs text-muted">Interviewer · {STATE_TEXT[state]}</figcaption>
    </figure>
  );
}
