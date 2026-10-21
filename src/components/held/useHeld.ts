"use client";

/**
 * The DOM half of a held object: while closing it plays its animation, then
 * reports DOM_CLOSED. CLOSE_MS mirrors the held-out animation in globals.css.
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
