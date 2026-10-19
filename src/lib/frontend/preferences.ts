/**
 * The user's interview defaults, kept in this browser (the settings board's
 * "Interview defaults" note). Read by the setup clipboard to pre-fill its
 * choices; the user can still change them per interview.
 *
 * Per device by design (user decision, 2026-10-18): no table, no migration.
 * Storage can be unavailable or hold anything — every read is validated and
 * every access is guarded, so a broken value means "no defaults", never a
 * crash.
 */

import { useSyncExternalStore } from "react";

import type { InterviewMode } from "@/lib/engine/types";
import type { InputMode } from "./types";

export interface InterviewDefaults {
  mode: InterviewMode;
  inputMode: InputMode;
}

export const DEFAULTS_KEY = "jobme:defaults";

export const FALLBACK_DEFAULTS: InterviewDefaults = { mode: "quick", inputMode: "voice" };

/** Parse a stored value; anything malformed is ignored field by field. */
export function parseDefaults(raw: string | null): InterviewDefaults | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof InterviewDefaults, unknown>>;
    if (!value || typeof value !== "object") return null;
    return {
      mode: value.mode === "full" || value.mode === "quick" ? value.mode : FALLBACK_DEFAULTS.mode,
      inputMode: value.inputMode === "typed" || value.inputMode === "voice" ? value.inputMode : FALLBACK_DEFAULTS.inputMode,
    };
  } catch {
    return null;
  }
}

/** Fired in this tab when the defaults change; "storage" covers other tabs. */
const CHANGED = "jobme:defaults-changed";

function rawDefaults(): string | null {
  try {
    return window.localStorage.getItem(DEFAULTS_KEY);
  } catch {
    return null;
  }
}

export function readDefaults(): InterviewDefaults | null {
  return parseDefaults(rawDefaults());
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The stored defaults as React state: null on the server, before hydration,
 * and when none are saved. Re-renders when they change, in this tab or another.
 */
export function useDefaults(): InterviewDefaults | null {
  // The raw string is the snapshot: a primitive, so React can compare it.
  const raw = useSyncExternalStore(subscribe, rawDefaults, () => null);
  return parseDefaults(raw);
}

/** Returns false when the browser would not store it (private mode, quota). */
export function writeDefaults(defaults: InterviewDefaults): boolean {
  try {
    window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults));
    window.dispatchEvent(new Event(CHANGED));
    return true;
  } catch {
    return false;
  }
}
