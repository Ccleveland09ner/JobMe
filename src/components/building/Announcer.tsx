"use client";

/** Announces where the user has arrived. A failed walk is explained by its page. */

import { useBuilding } from "./BuildingProvider";
import { STATION_LABEL } from "./stations";

export function Announcer() {
  const building = useBuilding();
  if (!building) return null;
  const { station, target } = building.state;
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {target === null ? `${STATION_LABEL[station]}.` : ""}
    </p>
  );
}
