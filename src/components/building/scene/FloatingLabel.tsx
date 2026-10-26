"use client";

/**
 * An object's name floating over it ("LEDGER", "REPORTS", …): the hovering
 * reception lettering (HoverLabel.tsx). Pointing at it or its object lights
 * both; clicking either runs the action. Hidden while the object is held.
 */

import { useBuilding } from "../BuildingProvider";
import type { Held } from "../heldMachine";
import type { Station } from "../stations";
import { HoverLabel } from "./HoverLabel";
import { useCanTouch, usePointing } from "./Interactive";

type Vec3 = [number, number, number];

export function FloatingLabel({
  action,
  station,
  at,
  lines,
  size = 0.072,
  depth = 0.022,
  holds,
}: {
  /** The action it runs (and the name it is pointed at by). */
  action: string;
  station: Station;
  /** Where it floats, in the world: just above its object. */
  at: Vec3;
  /** One word or more per line, centred. */
  lines: readonly string[];
  size?: number;
  depth?: number;
  /** The held object it names: hidden while that is picked up. */
  holds?: Held;
}) {
  const building = useBuilding();
  const canTouch = useCanTouch(station);
  const { hovered, bind } = usePointing(action, canTouch);
  const lifted = holds !== undefined && building?.held.held === holds && building.held.phase !== "resting";
  return (
    <HoverLabel
      at={at}
      lines={lines}
      size={size}
      depth={depth}
      hovered={hovered}
      bind={bind}
      visible={!lifted}
      onClick={() => {
        if (canTouch) building?.activate(action);
      }}
    />
  );
}
