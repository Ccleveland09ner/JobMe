"use client";

/**
 * The room's mic for the keyboard and screen readers when the 3D desk mic is
 * the one on screen: a real button with TableMic's names and states, drawing
 * nothing of its own, pinned over the 3D mic each frame (ScreenAnchor "mic"
 * in scene/DeskMic.tsx). Clicks go through to the 3D mic; tabbing to it rings
 * the 3D mic. Rendered into the body, so the page's layout (a blurred panel,
 * say) can't move the box its viewport position is measured in.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useBuilding } from "@/components/building/BuildingProvider";

import { MIC_LABEL } from "./TableMic";
import type { MicState } from "./types";

export function PinnedMic({ state, onToggle }: { state: Exclude<MicState, "off">; onToggle: () => void }) {
  const setAnchor = useBuilding()?.setAnchor;
  const [el, setEl] = useState<HTMLButtonElement | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!el || !setAnchor) return;
    setAnchor("mic", el);
    return () => setAnchor("mic", null);
  }, [el, setAnchor]);

  useEffect(() => {
    if (!blocked) return;
    const timer = setTimeout(() => setBlocked(false), 1800);
    return () => clearTimeout(timer);
  }, [blocked]);

  const disabled = state === "disabled";
  return createPortal(
    <>
      <button
        ref={setEl}
        type="button"
        aria-label={MIC_LABEL[state]}
        aria-pressed={state === "recording"}
        aria-disabled={disabled}
        onClick={() => (disabled ? setBlocked(true) : onToggle())}
        // Placed by the scene each frame; the pointer passes through to the 3D mic.
        className="pointer-events-none fixed left-0 top-0 z-10 rounded-2xl"
      />
      <p aria-live="polite" className="sr-only">
        {blocked ? "Wait for the interviewer to finish" : ""}
      </p>
    </>,
    document.body,
  );
}
