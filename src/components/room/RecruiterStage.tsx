"use client";

/**
 * The recruiter, wherever the room shows one: in the 3D building, the
 * recruiter seated in the building's interview room (this component only
 * drives it); elsewhere, the 3D recruiter inside the line-art room when the
 * browser can draw it, and the SVG recruiter otherwise.
 *
 * The SVG recruiter (Avatar.tsx) is never just a fallback for errors — it is
 * also what the server renders, what shows while the 1MB model downloads,
 * and what WebGL-less browsers keep. Both versions share the same 240x200
 * scene (RoomScenery.tsx) and the same props, so swapping one for the other
 * does not move anything on the page.
 */

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { useBuilding } from "@/components/building/BuildingProvider";
import { webglAvailable } from "@/lib/frontend/webgl";
import type { VisemeWeights } from "@/lib/voice/lipsync";

import type { MicControl } from "./Recruiter3D";

import { Avatar, type AvatarProps } from "./Avatar";
import { Desk, DeskMic, SCENE_VIEWBOX, ThoughtDots, Whiteboard } from "./RoomScenery";

// Browser-only: WebGL and three.js cannot render on the server.
const Recruiter3D = dynamic(() => import("./Recruiter3D"), { ssr: false });

const STATE_TEXT: Record<AvatarProps["state"], string> = {
  idle: "Waiting for your answer",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

const noSubscribe = () => () => {};


/** A failed model load or WebGL context falls back to the SVG recruiter. */
class FallbackOnError extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[recruiter] 3D unavailable, using the illustrated recruiter:", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function RecruiterStage({
  state,
  readMouth,
  readVisemes,
  mic,
}: AvatarProps & { readVisemes?: () => VisemeWeights | null; mic?: MicControl }) {
  // false on the server and before hydration: the SVG renders first.
  const canUse3D = useSyncExternalStore(noSubscribe, webglAvailable, () => false);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);

  // Inside the 3D building the recruiter is already in the room, in the
  // shared scene: hand it this state every render and show only the status.
  const building = useBuilding();
  // Pages hydrate inside a Suspense boundary, after the building already
  // knows WebGL works; hydrate as the server rendered (the SVG), then switch.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const inBuilding = hydrated && (building?.show3D ?? false);
  const setSpeaker = building?.setSpeaker;
  useEffect(() => {
    if (inBuilding) setSpeaker?.({ state, readMouth, readVisemes, mic });
  });
  useEffect(() => () => setSpeaker?.({ state: "idle" }), [setSpeaker]);
  if (inBuilding) return <p className="text-xs text-muted">Interviewer · {STATE_TEXT[state]}</p>;

  const svg = <Avatar state={state} readMouth={readMouth} />;
  if (!canUse3D) return svg;

  return (
    <FallbackOnError fallback={svg}>
      <figure className="flex flex-col items-center gap-2">
        <div className="relative aspect-[6/5] w-56 sm:w-72">
          {/* Until the model has drawn its first frame, the SVG recruiter
              holds the spot so nothing on the page jumps. */}
          {!ready && <div className="absolute inset-0 [&_figcaption]:hidden">{svg}</div>}

          <div className={`absolute inset-0 transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}>
            <svg viewBox={SCENE_VIEWBOX} aria-hidden="true" className="absolute inset-0 h-full w-full" strokeLinecap="round" strokeLinejoin="round">
              <Whiteboard />
            </svg>
            <div className="absolute inset-0">
              <Recruiter3D state={state} readMouth={readMouth} readVisemes={readVisemes} onReady={onReady} />
            </div>
            <svg viewBox={SCENE_VIEWBOX} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" strokeLinecap="round" strokeLinejoin="round">
              <Desk />
              <ThoughtDots visible={state === "thinking"} />
              <DeskMic listening={state === "listening"} />
            </svg>
          </div>
        </div>
        <figcaption className="text-xs text-muted">Interviewer · {STATE_TEXT[state]}</figcaption>
      </figure>
    </FallbackOnError>
  );
}
