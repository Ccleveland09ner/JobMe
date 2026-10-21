"use client";

/**
 * The SVG recruiter (flat line art). The head nods, the eyes blink, and the
 * mouth follows the voice through refs, so lip-sync never re-renders React.
 * Reduced motion: mouth only.
 */

import { useEffect, useRef } from "react";

import { prefersReducedMotion } from "@/lib/frontend/motion";

import { Desk, DeskMic, SCENE_VIEWBOX, ThoughtDots, Whiteboard } from "./RoomScenery";

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

/** Openness at rest: a friendly, slightly open smile like the reference. */
const MOUTH_REST = 0.2;
const EYE_RY = 2.8;

/** The mouth path: the lower lip drops with `open`; at 0 it's a closed smile. */
export function mouthPath(open: number): string {
  const o = Math.max(0, Math.min(1, open));
  return `M110 97 Q120 102 130 97 Q120 ${(102 + o * 12).toFixed(2)} 110 97 Z`;
}

export function Avatar({ state, readMouth }: AvatarProps) {
  const mouth = useRef<SVGPathElement>(null);
  const head = useRef<SVGGElement>(null);
  const eyes = useRef<SVGGElement>(null);
  const prevState = useRef(state);

  // Lip-sync while speaking.
  useEffect(() => {
    const el = mouth.current;
    if (!el) return;
    if (state !== "speaking") {
      el.setAttribute("d", mouthPath(MOUTH_REST));
      return;
    }
    const reduced = prefersReducedMotion();
    let raf = 0;
    const frame = () => {
      const live = readMouth?.() ?? null;
      const open =
        live !== null && live > 0.02
          ? live
          : 0.3 + 0.35 * Math.abs(Math.sin(performance.now() / 120));
      el.setAttribute("d", mouthPath(reduced ? Math.min(open, 0.45) : open));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      el.setAttribute("d", mouthPath(MOUTH_REST));
    };
  }, [state, readMouth]);

  // A nod as listening starts: "go ahead, I'm listening".
  useEffect(() => {
    const was = prevState.current;
    prevState.current = state;
    const el = head.current;
    if (!el || state !== "listening" || was === "listening" || prefersReducedMotion()) return;
    el.classList.remove("animate-avatar-nod");
    // Restart the animation even if the previous nod had not finished.
    void el.getBoundingClientRect();
    el.classList.add("animate-avatar-nod");
  }, [state]);

  // Blink every 3-6s at random.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let timer: ReturnType<typeof setTimeout>;
    const setEyes = (ry: number) =>
      eyes.current?.querySelectorAll("ellipse").forEach((e) => e.setAttribute("ry", String(ry)));
    const schedule = () => {
      timer = setTimeout(() => {
        setEyes(0.35);
        timer = setTimeout(() => {
          setEyes(EYE_RY);
          schedule();
        }, 130);
      }, 3000 + Math.random() * 3000);
    };
    schedule();
    return () => {
      clearTimeout(timer);
      setEyes(EYE_RY);
    };
  }, []);

  const listening = state === "listening";

  return (
    <figure className="flex flex-col items-center gap-2">
      <svg
        viewBox={SCENE_VIEWBOX}
        aria-hidden="true"
        className="h-auto w-56 sm:w-72"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Whiteboard />

        {/* Chair back */}
        <path
          d="M78 176V112q0-10 12-10h60q12 0 12 10v64"
          className="fill-surface stroke-ink"
          strokeWidth={2}
        />

        {/* Neck, under the collar */}
        <path d="M110 106v24h20v-24" className="fill-surface stroke-ink" strokeWidth={2} />

        {/* Body: sweater, arm outlines, white collar and shirt V, name badge */}
        <path d="M66 176c2-36 22-48 54-50 32 2 52 14 54 50z" className="fill-ink" />
        <path d="M78 146q6 16 16 20M162 146q-6 16-16 20" className="fill-none stroke-surface" strokeWidth={1.6} />
        <path d="M106 126l14 20 14-20z" className="fill-surface stroke-ink" strokeWidth={2} />
        <path d="M106 125l14 15-10 6-8-16z" className="fill-surface stroke-ink" strokeWidth={2} />
        <path d="M134 125l-14 15 10 6 8-16z" className="fill-surface stroke-ink" strokeWidth={2} />
        <rect x={138} y={150} width={18} height={7} rx={1.5} className="fill-surface" />

        {/* Head: its own group so it can nod about the neck. */}
        <g ref={head} style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}>
          {/* Sits the head lower on the neck than the drawing coordinates. */}
          <g transform="translate(0 7)">
          {/* ears */}
          <g className="fill-surface stroke-ink" strokeWidth={2}>
            <circle cx={93} cy={80} r={6.5} />
            <circle cx={147} cy={80} r={6.5} />
          </g>
          {/* face */}
          <ellipse cx={120} cy={78} rx={27} ry={29} className="fill-surface stroke-ink" strokeWidth={2.5} />
          {/* curly hair: a cap plus overlapping curls for the silhouette */}
          <g className="fill-ink">
            <path d="M90 76q-2-26 30-30q32 4 30 30q-4-12-14-14q-16-6-32 0q-10 2-14 14z" />
            <circle cx={92} cy={68} r={7} />
            <circle cx={96} cy={56} r={8} />
            <circle cx={106} cy={47} r={8} />
            <circle cx={120} cy={43} r={9} />
            <circle cx={134} cy={47} r={8} />
            <circle cx={144} cy={56} r={8} />
            <circle cx={148} cy={68} r={7} />
            <circle cx={112} cy={54} r={6} />
            <circle cx={128} cy={54} r={6} />
          </g>
          {/* curl texture */}
          <path
            d="M100 55q3-4 7 0M115 46q3-4 7 0M130 50q3-4 6 0M141 61q3-3 5 1M95 66q2-3 5 0"
            className="fill-none stroke-surface"
            strokeWidth={1.4}
          />
          {/* brows */}
          <path d="M102 67q7-3 14 0M124 67q7-3 14 0" className="fill-none stroke-ink" strokeWidth={2} />
          {/* glasses */}
          <g className="fill-none stroke-ink" strokeWidth={2.4}>
            <circle cx={109} cy={80} r={9} />
            <circle cx={131} cy={80} r={9} />
            <path d="M118 79q2-2 4 0M100 79l-7-2M140 79l7-2" />
          </g>
          {/* eyes: blink by flattening */}
          <g ref={eyes} className="fill-ink">
            <ellipse cx={109} cy={81} rx={2.4} ry={EYE_RY} />
            <ellipse cx={131} cy={81} rx={2.4} ry={EYE_RY} />
          </g>
          {/* nose */}
          <path d="M120 85q-3 7 1 8" className="fill-none stroke-ink" strokeWidth={1.8} />
          {/* mouth: lower lip driven by the voice */}
          <path ref={mouth} d={mouthPath(MOUTH_REST)} className="fill-ink stroke-ink" strokeWidth={2.2} />
          </g>
        </g>

        {/* Speech ticks beside the face while talking, as in the reference. */}
        <path
          d="M162 77l7-4M164 85h8M162 93l7 4"
          className={`fill-none stroke-ink transition-opacity ${state === "speaking" ? "opacity-100" : "opacity-0"}`}
          strokeWidth={2}
        />

        <ThoughtDots visible={state === "thinking"} />

        {/* Desk, then the clasped hands resting on it. */}
        <Desk />
        <g className="fill-surface stroke-ink" strokeWidth={2}>
          <rect x={92} y={163} width={10} height={11} rx={2} />
          <rect x={138} y={163} width={10} height={11} rx={2} />
          <ellipse cx={113} cy={170} rx={11} ry={7} />
          <ellipse cx={127} cy={170} rx={11} ry={7} />
          <path d="M117 165q4 5 0 10M123 165q-4 5 0 10" className="fill-none" />
        </g>

        <DeskMic listening={listening} />
      </svg>
      {/* Not a live region: the captions and controls already announce changes. */}
      <figcaption className="text-xs text-muted">Interviewer · {STATE_TEXT[state]}</figcaption>
    </figure>
  );
}
