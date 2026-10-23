"use client";

/** The room's notepad: a held object in the building (heldMachine.ts); without the building it just opens. */

import { useCallback, useEffect, useState } from "react";

import { useBuilding } from "@/components/building/BuildingProvider";
import { domVisible } from "@/components/building/heldMachine";

export function useNotepadHold() {
  const building = useBuilding();
  const dispatchHeld = building?.dispatchHeld;
  const setAction = building?.setAction;
  const [openLocally, setOpenLocally] = useState(false);
  const open = building ? building.held.held === "notepad" && domVisible(building.held) : openLocally;
  const openNotes = useCallback(() => {
    if (dispatchHeld) dispatchHeld({ type: "REQUEST", want: "notepad" });
    else setOpenLocally(true);
  }, [dispatchHeld]);
  const closeNotes = useCallback(() => {
    if (dispatchHeld) dispatchHeld({ type: "REQUEST", want: null });
    else setOpenLocally(false);
  }, [dispatchHeld]);
  // Clicking the 3D notepad does the same as the Notes button.
  useEffect(() => {
    if (!setAction) return;
    setAction("notepad", openNotes);
    return () => setAction("notepad", null);
  }, [setAction, openNotes]);
  return { open, openNotes, closeNotes };
}
