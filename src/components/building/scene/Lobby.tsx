"use client";

/**
 * Inside the front doors: the lobby and the front desk, with the secretary's
 * chair behind it and the corridor to the interview room in the back-left
 * corner. The settings notice board hangs on the back wall, right of the
 * desk; the ledger and the reports folder lie on the counter (Objects.tsx).
 */

import { CORRIDOR, DESK, FACADE_Z, LOBBY, SECRETARY } from "../world";
import { DeskObjects, NoticeBoard } from "./Objects";
import { OfficeChair } from "./OfficeChair";
import { Box, CeilingLight, Pane, PottedPlant, Slab } from "./parts";

export function Lobby() {
  const { left, right, back, height } = LOBBY;
  const cl = CORRIDOR.x - CORRIDOR.width / 2;
  const cr = CORRIDOR.x + CORRIDOR.width / 2;
  const deskBack = DESK.z - DESK.depth;
  return (
    <group>
      {/* Floor, rug and ceiling. */}
      <Slab x={[left, right]} y={[-0.08, 0]} z={[back, FACADE_Z - 0.3]} color="floor" />
      <Slab x={[-2.4, 2.4]} y={[0, 0.015]} z={[DESK.z + 0.6, -1.2]} color="trim" />
      <Slab x={[left, right]} y={[height, height + 0.1]} z={[back, FACADE_Z - 0.3]} color="surface" />
      {[-3, 0, 3].map((x) => (
        <CeilingLight key={x} at={[x, height - 0.03, -4]} />
      ))}

      {/* Side walls, with windows, and the back wall around the corridor opening. */}
      <Slab x={[left - 0.2, left]} y={[0, height]} z={[back, FACADE_Z - 0.3]} />
      <Slab x={[right, right + 0.2]} y={[0, height]} z={[back, FACADE_Z - 0.3]} />
      <Pane at={[left + 0.02, 1.8, -3]} width={1.6} height={1.6} sideways />
      <Pane at={[right - 0.02, 1.8, -3]} width={1.6} height={1.6} sideways />
      <Slab x={[left, cl]} y={[0, height]} z={[back - 0.2, back]} />
      <Slab x={[cr, right]} y={[0, height]} z={[back - 0.2, back]} />
      <Slab x={[cl, cr]} y={[CORRIDOR.height, height]} z={[back - 0.2, back]} />
      {/* Skirting along the walls, in the trim colour. */}
      <Slab x={[left, right]} y={[0, 0.12]} z={[back, back + 0.03]} color="trim" />

      {/* The front desk: counter, wood top, a teal stripe, and the secretary's chair. */}
      <Slab x={[-DESK.width / 2, DESK.width / 2]} y={[0, DESK.height]} z={[deskBack, DESK.z]} color="surface" />
      <Slab x={[-DESK.width / 2 - 0.05, DESK.width / 2 + 0.05]} y={[DESK.height, DESK.height + 0.06]} z={[deskBack - 0.05, DESK.z + 0.08]} color="wood" />
      <Slab x={[-DESK.width / 2, DESK.width / 2]} y={[0.48, 0.55]} z={[DESK.z, DESK.z + 0.01]} color="accent" />
      <OfficeChair at={[SECRETARY.x, 0, SECRETARY.z - 0.05]} />
      {/* On the counter: a pen pot. The ledger and the reports folder lie
          either side of the secretary (Objects.tsx), ready to be picked up. */}
      <Box size={[0.1, 0.16, 0.1]} at={[-1.45, DESK.height + 0.14, DESK.z - 0.4]} color="ink" />
      <DeskObjects />

      {/* Back wall: the settings notice board, and a plant. */}
      <NoticeBoard />
      <PottedPlant at={[right - 0.6, 0, back + 0.6]} />
      <PottedPlant at={[left + 0.6, 0, -1.2]} />

      {/* A bench by the window, for waiting. */}
      <Slab x={[right - 0.6, right - 0.1]} y={[0.42, 0.5]} z={[-5, -2]} color="wood" />
      <Slab x={[right - 0.55, right - 0.15]} y={[0, 0.42]} z={[-4.9, -4.7]} color="ink" />
      <Slab x={[right - 0.55, right - 0.15]} y={[0, 0.42]} z={[-2.3, -2.1]} color="ink" />
    </group>
  );
}
