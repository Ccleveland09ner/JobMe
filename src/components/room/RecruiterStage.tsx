"use client";

/**
 * The recruiter wherever the room shows one: driven in the 3D building's
 * room; otherwise the 3D bust when WebGL works, else the SVG recruiter (also
 * the server render and the placeholder while the model loads).
 */

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useState, type ReactNode } from "react";

import { useBuilding, useShow3D } from "@/components/building/BuildingProvider";
import { useBrowserValue } from "@/components/common/useBrowserValue";
import { webglAvailable } from "@/lib/frontend/webgl";
import type { VisemeWeights } from "@/lib/voice/lipsync";

import { Avatar, type AvatarProps } from "./Avatar";
import { Desk, SCENE_VIEWBOX, ThoughtDots, Whiteboard } from "./RoomScenery";
import { RECRUITER_STATE_TEXT, type MicControl } from "./types";

// Browser-only: WebGL and three.js cannot render on the server.
const Recruiter3D = dynamic(() => import("./Recruiter3D"), { ssr: false });


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
  const canUse3D = useBrowserValue(webglAvailable, false);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);

  // In the 3D building the recruiter is in the shared scene: just drive it.
  const building = useBuilding();
  // Null until hydrated: the server rendered the SVG, so that comes first.
  const inBuilding = useShow3D() === true;
  const setSpeaker = building?.setSpeaker;
  useEffect(() => {
    if (inBuilding) setSpeaker?.({ state, readMouth, readVisemes, mic });
  });
  useEffect(() => () => setSpeaker?.({ state: "idle" }), [setSpeaker]);
  if (inBuilding) return <p className="text-xs text-muted">Interviewer · {RECRUITER_STATE_TEXT[state]}</p>;

  const svg = <Avatar state={state} readMouth={readMouth} />;
  if (!canUse3D) return svg;

  return (
    <FallbackOnError fallback={svg}>
      <figure className="flex flex-col items-center gap-2">
        <div className="relative aspect-[6/5] w-56 sm:w-72">
          {/* The SVG holds the spot until the model's first frame. */}
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
            </svg>
          </div>
        </div>
        <figcaption className="text-xs text-muted">Interviewer · {RECRUITER_STATE_TEXT[state]}</figcaption>
      </figure>
    </FallbackOnError>
  );
}
