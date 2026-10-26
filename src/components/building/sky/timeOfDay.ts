"use client";

/**
 * The visitor's time of day, from their device clock, for the sky over the
 * street. `?time=day|dusk|night` overrides the clock (for testing). The server
 * and hydration see null; the clock is only read in the browser.
 */

import { useSyncExternalStore } from "react";

export type TimeOfDay = "day" | "dusk" | "night";

export const TIMES_OF_DAY: readonly TimeOfDay[] = ["day", "dusk", "night"];

/** Day 06:00–16:59, dusk 17:00–19:59, night 20:00–05:59. */
export function timeOfDayAt(hour: number): TimeOfDay {
  if (hour >= 6 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

/** `?time=` if it names a time of day, otherwise the hour's. */
export function timeOfDayFor(hour: number, search: string): TimeOfDay {
  const forced = new URLSearchParams(search).get("time");
  return (TIMES_OF_DAY as readonly string[]).includes(forced ?? "") ? (forced as TimeOfDay) : timeOfDayAt(hour);
}

const CHECK_EVERY_MS = 60_000;

/**
 * The dev sky toggle's choice (SkyTimeToggle.tsx): a time of day, "clock" for
 * the clock even over ?time=, or null for no choice.
 */
export type SkyOverride = TimeOfDay | "clock" | null;
let override: SkyOverride = null;

const byClock = () => timeOfDayAt(new Date().getHours());

function read(): TimeOfDay {
  if (override === "clock") return byClock();
  return override ?? timeOfDayFor(new Date().getHours(), window.location.search);
}

let current: TimeOfDay | null = null;
let clock: TimeOfDay | null = null;
const listeners = new Set<() => void>();
let timer: number | undefined;

function check() {
  const next = read();
  const nextClock = byClock();
  if (next === current && nextClock === clock) return;
  current = next;
  clock = nextClock;
  listeners.forEach((listener) => listener());
}

/** For the dev sky toggle only: show this time of day instead. */
export function setSkyOverride(next: SkyOverride) {
  override = next;
  check();
}

/** Re-checks every minute, and when the tab comes back (timers sleep in the background). */
function onVisible() {
  if (document.visibilityState === "visible") check();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    check();
    timer = window.setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    window.clearInterval(timer);
    timer = undefined;
    document.removeEventListener("visibilitychange", onVisible);
  };
}

const snapshot = () => (current ??= read());
const clockSnapshot = () => (clock ??= byClock());
const onServer = () => null;

/** The time of day the sky shows, or null on the server and through hydration. */
export function useTimeOfDay(): TimeOfDay | null {
  return useSyncExternalStore<TimeOfDay | null>(subscribe, snapshot, onServer);
}

/** The time of day by the clock alone, whatever the sky is showing; null on the server and through hydration. */
export function useClockTimeOfDay(): TimeOfDay | null {
  return useSyncExternalStore<TimeOfDay | null>(subscribe, clockSnapshot, onServer);
}
