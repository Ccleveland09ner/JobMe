"use client";

/**
 * The recruiter, as the interview room shows her: the 3D recruiter
 * (Recruiter3D) inside the line-art room (RoomScenery).
 *
 * The fallback is a still image of the same recruiter
 * (public/models/recruiter-still.png, rendered from the model), never a
 * different character. It covers every case where the 3D cannot draw:
 *   - the server render, and the moment before hydration
 *   - while the ~1MB model downloads
 *   - no WebGL (hardware acceleration off, locked-down or very old machines)
 *   - the model failing to load
 *   - the GPU context being lost mid-interview
 * The interview never depends on her: captions carry every question.
 */

import dynamic from "next/dynamic";
import Image from "next/image";
import { Component, useCallback, useState, useSyncExternalStore, type ReactNode } from "react";

import { Desk, DeskMic, SCENE_VIEWBOX, ThoughtDots, Whiteboard } from "./RoomScenery";

// Browser-only: WebGL and three.js cannot render on the server.
const Recruiter3D = dynamic(() => import("./Recruiter3D"), { ssr: false });

export const RECRUITER_STILL = "/models/recruiter-still.png";

export type RecruiterState = "idle" | "listening" | "thinking" | "speaking";

export interface RecruiterStageProps {
  state: RecruiterState;
  /** Live mouth openness 0..1, or null when no audio signal is available. */
  readMouth?: () => number | null;
  /** Width of the stage; the height follows the room's 6:5 shape. */
  className?: string;
  /** Development only: show the fallback still instead of the 3D. */
  forceStill?: boolean;
}

const STATE_TEXT: Record<RecruiterState, string> = {
  idle: "Waiting for your answer",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

const noSubscribe = () => () => {};

let webglSupport: boolean | null = null;

/**
 * Probed ONCE per page and cached. This runs as a useSyncExternalStore
 * snapshot, i.e. on every render — and each probe creates a real WebGL
 * context. Browsers cap live contexts (~16) and kill the oldest when the cap
 * is hit, which is the recruiter's own: a few state changes would leak
 * enough probes to blank her. The probe context is also released at once.
 */
function webglAvailable(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    webglSupport = gl !== null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/** A failed model load (or any render error) drops to the still. */
class OnError extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[recruiter] 3D unavailable, showing the still:", error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function RecruiterStage({ state, readMouth, className = "w-56 sm:w-72", forceStill = false }: RecruiterStageProps) {
  // false on the server and before hydration: the still renders first.
  const canUse3D = useSyncExternalStore(noSubscribe, webglAvailable, () => false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const onFail = useCallback(() => setFailed(true), []);

  const show3D = canUse3D && !failed && !forceStill;
  const showStill = !show3D || !ready;

  return (
    <figure className="flex flex-col items-center gap-2">
      <div className={`relative aspect-[6/5] ${className}`}>
        {showStill && (
          <Image src={RECRUITER_STILL} alt="" fill priority sizes="(min-width: 640px) 288px, 224px" className="object-contain" />
        )}

        {show3D && (
          <OnError onError={onFail}>
            <div className={`absolute inset-0 transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}>
              <svg viewBox={SCENE_VIEWBOX} aria-hidden="true" className="absolute inset-0 h-full w-full" strokeLinecap="round" strokeLinejoin="round">
                <Whiteboard />
              </svg>
              <div className="absolute inset-0">
                <Recruiter3D state={state} readMouth={readMouth} onReady={onReady} onLost={onFail} />
              </div>
            </div>
          </OnError>
        )}

        {/* In front of either: the desk, the live mic and the thought dots. */}
        <svg viewBox={SCENE_VIEWBOX} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" strokeLinecap="round" strokeLinejoin="round">
          <Desk />
          <ThoughtDots visible={state === "thinking"} />
          <DeskMic listening={state === "listening"} />
        </svg>
      </div>
      {/* Not a live region: phase changes are already announced through the
          captions and the answer controls, and repeating them here is noise. */}
      <figcaption className="text-xs text-muted">Interviewer · {STATE_TEXT[state]}</figcaption>
    </figure>
  );
}
