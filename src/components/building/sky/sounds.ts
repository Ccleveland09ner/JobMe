"use client";

/**
 * The street's sounds by time of day: day sounds through the day, dusk sounds
 * at sunrise and at sunset (the sky's dusk), evening sounds through the night.
 * A sky shown at another time (the dev toggle, ?time=) sounds as it looks.
 */

import { useSyncExternalStore } from "react";

import { timeOfDayAt, useClockTimeOfDay, useTimeOfDay, type TimeOfDay } from "./timeOfDay";

export type StreetSound = "day" | "dusk" | "evening";

export const STREET_SOUNDS: Record<StreetSound, string> = {
  day: "/audio/sound/day.mp3",
  dusk: "/audio/sound/dusk.mp3",
  evening: "/audio/sound/evening.mp3",
};

/** Under the street, as the lobby's music is under the lobby. */
export const STREET_VOLUME = 0.2;

/** Sunrise, 05:00–06:59, around the sky turning to day at 06:00. */
const SUNRISE = { from: 5, to: 7 } as const;

const soundOf = (time: TimeOfDay): StreetSound => (time === "night" ? "evening" : time);

/** The sound for an hour of the clock. */
export function streetSoundAt(hour: number): StreetSound {
  if (hour >= SUNRISE.from && hour < SUNRISE.to) return "dusk";
  return soundOf(timeOfDayAt(hour));
}

/** The sound for the sky on show: the clock's hour, unless the sky is shown at another time. */
export function streetSoundFor(showing: TimeOfDay, clock: TimeOfDay, hour: number): StreetSound {
  return showing === clock ? streetSoundAt(hour) : soundOf(showing);
}

const CHECK_EVERY_MS = 60_000;

function subscribeHour(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, CHECK_EVERY_MS);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

/** The street's sound now, or null on the server and through hydration. */
export function useStreetSound(): StreetSound | null {
  const showing = useTimeOfDay();
  const clock = useClockTimeOfDay();
  const hour = useSyncExternalStore(
    subscribeHour,
    () => new Date().getHours(),
    () => null,
  );
  if (showing === null || clock === null || hour === null) return null;
  return streetSoundFor(showing, clock, hour);
}
