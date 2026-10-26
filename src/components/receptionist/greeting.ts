/**
 * Whether Ms. Crystal owes the user a greeting: one per sign-in, not one each
 * time they come back to the desk. Signing in arms it; her greeting, once
 * begun, spends it. Kept for the tab (sessionStorage), so a reload on the way
 * to the desk keeps it and a new tab of a session already signed in has none.
 */

import { useSyncExternalStore } from "react";

const OWED_KEY = "jobme:greeting-owed";

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Owed in this tab; false wherever the browser won't say (the server, private mode). */
export function isGreetingOwed(): boolean {
  try {
    return window.sessionStorage.getItem(OWED_KEY) !== null;
  } catch {
    return false;
  }
}

/** Signed in: she greets them at the desk. */
export function oweGreeting(): void {
  try {
    window.sessionStorage.setItem(OWED_KEY, new Date().toISOString());
  } catch {
    // Not stored: she stays quiet, nothing more.
  }
  emit();
}

/** Her greeting has begun (or can't happen): nothing more is owed until the next sign-in. */
export function spendGreeting(): void {
  try {
    window.sessionStorage.removeItem(OWED_KEY);
  } catch {
    // Nothing was stored.
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The same, as React state; never owed on the server and through hydration. */
export function useGreetingOwed(): boolean {
  return useSyncExternalStore(subscribe, isGreetingOwed, () => false);
}
