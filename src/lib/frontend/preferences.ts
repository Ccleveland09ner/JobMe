/**
 * The user's preferences, stored in this browser (per device by design): the
 * interview defaults, and whether the lobby plays music. Every read is
 * validated: a broken value means the fallback.
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

/** Fired in this tab when a preference changes; "storage" covers other tabs. */
const CHANGED = "jobme:preferences-changed";

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Returns false when the browser would not store it (private mode, quota). */
function store(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    window.dispatchEvent(new Event(CHANGED));
    return true;
  } catch {
    return false;
  }
}

const rawDefaults = () => readStored(DEFAULTS_KEY);

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

/** The stored defaults as React state; null on the server and when none are saved. */
export function useDefaults(): InterviewDefaults | null {
  // The raw string is the snapshot: a primitive, so React can compare it.
  const raw = useSyncExternalStore(subscribe, rawDefaults, () => null);
  return parseDefaults(raw);
}

/** Returns false when the browser would not store it (private mode, quota). */
export function writeDefaults(defaults: InterviewDefaults): boolean {
  return store(DEFAULTS_KEY, JSON.stringify(defaults));
}

export const MUSIC_KEY = "jobme:music";

/** The lobby plays music unless it has been turned off. */
export function parseLobbyMusic(raw: string | null): boolean {
  return raw !== "off";
}

const rawMusic = () => readStored(MUSIC_KEY);

/** Whether the lobby plays music; on, on the server and until the user turns it off. */
export function useLobbyMusic(): boolean {
  return parseLobbyMusic(useSyncExternalStore(subscribe, rawMusic, () => null));
}

/** Returns false when the browser would not store it (private mode, quota). */
export function writeLobbyMusic(on: boolean): boolean {
  return store(MUSIC_KEY, on ? "on" : "off");
}
