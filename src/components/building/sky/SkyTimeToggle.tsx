"use client";

/**
 * Development only (the (building) layout mounts it under `next dev`): switch
 * the street's sky between the clock's time of day and the other two, to see
 * how they look. Shown on the street at rest, with the 3D scene.
 */

import type { ReactNode } from "react";

import { useBuilding } from "../BuildingProvider";
import { setSkyOverride, TIMES_OF_DAY, useClockTimeOfDay, useTimeOfDay, type SkyOverride, type TimeOfDay } from "./timeOfDay";

const LABEL: Record<TimeOfDay, string> = { day: "Day", dusk: "Dusk", night: "Night" };

const icon = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const ICON: Record<TimeOfDay, ReactNode> = {
  day: icon(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>,
  ),
  dusk: icon(
    <>
      <path d="M7 17a5 5 0 0 1 10 0" />
      <path d="M2 21h20M12 3v4M4.9 9.9l1.4 1.4M19.1 9.9l-1.4 1.4" />
    </>,
  ),
  night: icon(<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />),
};

/** Nothing outside development, so production bundles drop the toggle altogether. */
export const SkyTimeToggle = process.env.NODE_ENV === "development" ? DevSkyTimeToggle : () => null;

function DevSkyTimeToggle() {
  const building = useBuilding();
  const clock = useClockTimeOfDay();
  const showing = useTimeOfDay();
  const atStreet = building?.show3D && building.state.station === "street" && building.state.target === null;
  if (!atStreet || !clock || !showing) return null;

  const options: { value: SkyOverride; time: TimeOfDay; label: string }[] = [
    { value: "clock", time: clock, label: `Now · ${LABEL[clock]}` },
    ...TIMES_OF_DAY.filter((t) => t !== clock).map((t) => ({ value: t, time: t, label: LABEL[t] })),
  ];
  const selected: SkyOverride = showing === clock ? "clock" : showing;

  return (
    <div className="fixed bottom-4 right-4 z-20">
      <div role="group" aria-label="Sky preview (development only)" className="grain flex items-center gap-1 rounded-2xl border-2 border-ink bg-surface/90 p-1 shadow-md backdrop-blur-sm">
        <span className="hidden px-2 text-[11px] font-semibold uppercase tracking-wider text-muted sm:inline">Sky</span>
        {options.map((o) => {
          const on = selected === o.value;
          return (
            <button
              key={o.time}
              type="button"
              aria-pressed={on}
              onClick={() => setSkyOverride(o.value)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                on ? "bg-ink text-bg" : "text-ink hover:bg-sunken"
              }`}
            >
              {ICON[o.time]}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
