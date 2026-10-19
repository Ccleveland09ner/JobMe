"use client";

/**
 * The DOM half of a held object (components/building/heldMachine.ts).
 *
 * While the machine says "open" the object is in the user's hands; when it
 * says "closing" the object plays its closing animation and then reports
 * DOM_CLOSED, so its 3D self can travel back. Outside the building (no
 * provider) the object is simply open.
 *
 * CLOSE_MS mirrors the longest closing animation in globals.css (held-out).
 */

import { useEffect } from "react";

import { useBuilding } from "@/components/building/BuildingProvider";
import type { Held } from "@/components/building/heldMachine";
import { prefersReducedMotion } from "@/lib/voice/audio-graph";

export const CLOSE_MS = 420;

export function useHeld(name: Held): { closing: boolean } {
  const building = useBuilding();
  const closing = building?.held.held === name && building.held.phase === "closing";
  const dispatchHeld = building?.dispatchHeld;

  useEffect(() => {
    if (!closing || !dispatchHeld) return;
    const timer = setTimeout(() => dispatchHeld({ type: "DOM_CLOSED" }), prefersReducedMotion() ? 0 : CLOSE_MS);
    return () => clearTimeout(timer);
  }, [closing, dispatchHeld]);

  return { closing };
}
