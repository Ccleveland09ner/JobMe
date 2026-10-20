"use client";

/**
 * The candidate's microphone button: a tabletop podcast mic, after
 * design/Black USB Podcast Microphone on Stand.png and its interactive SVG
 * (a metal body, a mesh grille, a status ring with a mic icon, a status dot).
 *
 *   disabled   the interviewer is speaking: it does not start, and a press
 *              says why (🚫) instead of silently doing nothing
 *   ready      the candidate's turn: press to start answering
 *   recording  lit green and pulsing: press to send
 *
 * A real <button> with aria-pressed: keyboard and screen readers get the same
 * control as the pointer. aria-disabled rather than `disabled`, so it stays
 * focusable and can explain itself when pressed too early.
 */

import { useEffect, useId, useRef, useState } from "react";

import type { MicState } from "./Recruiter3D";

const LABEL: Record<Exclude<MicState, "off">, string> = {
  disabled: "Microphone unavailable while the interviewer is speaking",
  ready: "Start answering",
  recording: "Send answer",
};

export function TableMic({ state, onToggle }: { state: Exclude<MicState, "off">; onToggle: () => void }) {
  const id = useId().replace(/:/g, "");
  const [blocked, setBlocked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const live = state === "recording";
  const disabled = state === "disabled";

  function press() {
    if (disabled) {
      setBlocked(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setBlocked(false), 1800);
      return;
    }
    onToggle();
  }

  // Ring and dot colours by state: grey at rest, green while recording.
  const ring = live ? "#32db89" : disabled ? "#3f4855" : "#8a9bb3";
  const dot = live ? "#40f09c" : disabled ? "#4b5563" : "#9fb0c6";

  return (
    <div className="relative flex flex-col items-center">
      <button
        type="button"
        aria-label={LABEL[state]}
        aria-pressed={live}
        aria-disabled={disabled}
        onClick={press}
        className={`group rounded-3xl p-2 transition-transform ${
          disabled ? "cursor-not-allowed opacity-80" : "cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
        } motion-reduce:transform-none`}
      >
        <svg viewBox="0 0 400 510" aria-hidden="true" className="h-auto w-28 drop-shadow-[0_14px_14px_rgba(0,0,0,0.35)] sm:w-32">
          <defs>
            <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="0">
              <stop stopColor="#101923" />
              <stop offset=".22" stopColor="#465261" />
              <stop offset=".48" stopColor="#26313f" />
              <stop offset=".84" stopColor="#111923" />
              <stop offset="1" stopColor="#536072" />
            </linearGradient>
            <linearGradient id={`${id}-mesh`} x1="0" y1="0" x2="1" y2=".4">
              <stop stopColor="#151d28" />
              <stop offset=".5" stopColor="#434b57" />
              <stop offset="1" stopColor="#111821" />
            </linearGradient>
            <pattern id={`${id}-grid`} width="7" height="7" patternUnits="userSpaceOnUse">
              <path d="M0 0H7M0 0V7" stroke="#95a4b8" strokeOpacity=".35" strokeWidth=".8" />
            </pattern>
            <linearGradient id={`${id}-base`} x1="0" y1="0" x2=".8" y2="1">
              <stop stopColor="#586577" />
              <stop offset=".4" stopColor="#1e2836" />
              <stop offset="1" stopColor="#0e1621" />
            </linearGradient>
          </defs>
          <ellipse cx="200" cy="470" rx="142" ry="23" fill="#03070c" opacity=".3" />
          <rect x="186" y="368" width="28" height="77" rx="8" fill={`url(#${id}-metal)`} />
          <ellipse cx="200" cy="448" rx="130" ry="24" fill="#111a26" stroke="#647184" strokeWidth="3" />
          <path d="M70 448Q70 418 200 418Q330 418 330 448L328 460Q200 501 72 460Z" fill={`url(#${id}-base)`} stroke="#384457" strokeWidth="2" />
          <path d="M118 230V314Q118 373 200 373Q282 373 282 314V230" fill="none" stroke="#141c27" strokeWidth="23" />
          <path d="M118 230V314Q118 373 200 373Q282 373 282 314V230" fill="none" stroke="#596678" strokeWidth="5" />
          <rect x="130" y="79" width="140" height="268" rx="67" fill={`url(#${id}-metal)`} stroke="#657083" strokeWidth="3" />
          <rect x="136" y="80" width="128" height="128" rx="62" fill={`url(#${id}-mesh)`} />
          <rect x="136" y="80" width="128" height="128" rx="62" fill={`url(#${id}-grid)`} opacity=".9" />
          <path d="M133 199Q200 218 267 199" fill="none" stroke="#9098a3" strokeWidth="5" />
          <circle cx="120" cy="243" r="17" fill="#111b27" stroke="#7a8594" strokeWidth="4" />
          <circle cx="280" cy="243" r="17" fill="#111b27" stroke="#7a8594" strokeWidth="4" />
          <g className={live ? "motion-safe:animate-pulse" : undefined}>
            <circle
              cx="200"
              cy="259"
              r="27"
              fill="none"
              stroke={ring}
              strokeWidth="5"
              style={{ filter: live ? "drop-shadow(0 0 12px #32db89)" : undefined, transition: "stroke .24s" }}
            />
          </g>
          <g fill="none" stroke="#d7e3ee" strokeLinecap="round" strokeWidth="3">
            <rect x="193" y="245" width="14" height="23" rx="7" />
            <path d="M188 259a12 12 0 0 0 24 0M200 271v7m-8 0h16" />
          </g>
          <circle
            cx="200"
            cy="305"
            r="5"
            fill={dot}
            style={{ filter: live ? "drop-shadow(0 0 13px #38ef96)" : undefined, transition: "fill .24s" }}
          />
          <circle cx="200" cy="328" r="15" fill="#141c26" stroke="#778294" strokeWidth="2" />
          <path d="M200 318v8" stroke="#e3ebf5" strokeWidth="2.5" strokeLinecap="round" />
          {disabled && (
            // The "no entry" mark while the interviewer speaks.
            <g opacity={blocked ? 1 : 0.75}>
              <circle cx="200" cy="150" r="46" fill="#ffffff" opacity=".9" />
              <text x="200" y="168" textAnchor="middle" fontSize="54">
                🚫
              </text>
            </g>
          )}
        </svg>
      </button>
      <p aria-live="polite" className="pointer-events-none absolute -top-2 min-h-5 whitespace-nowrap rounded-full bg-ink/90 px-3 py-1 text-xs text-white opacity-0 transition-opacity data-[show=true]:opacity-100" data-show={blocked}>
        {blocked ? "🚫 Wait for the interviewer to finish" : ""}
      </p>
    </div>
  );
}
