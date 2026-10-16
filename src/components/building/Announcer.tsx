"use client";

/**
 * Says where the user has arrived. The only live region the building adds:
 * a walk that turns back is always explained by the page that started it
 * (its own error alert), so the building does not say it twice.
 */

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
