"use client";

import { useEffect } from "react";

import { isTextEntry } from "@/lib/frontend/dom";

/**
 * ArrowRight and ArrowLeft turn pages, unless the keys are for typing,
 * something already handled them, or a dialog is open on top.
 */
export function usePageArrowKeys(enabled: boolean, next: () => void, prev: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTextEntry(e.target) || document.querySelector("dialog[open]")) return;
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, next, prev]);
}
