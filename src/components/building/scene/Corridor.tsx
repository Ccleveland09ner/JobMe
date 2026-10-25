"use client";

/** The hall from the lobby to the interview room, ending at the room's door. */

import { memo } from "react";

import { CORRIDOR, ROOM } from "../world";
import { CeilingLight, Slab } from "./parts";
import { SwingDoor } from "./SwingDoor";

export const ROOM_DOOR_WIDTH = 1;

/** Memoized: its props rarely change, and it reads no context itself. */
export const Corridor = memo(function Corridor({ doorOpen }: { doorOpen: boolean }) {
  const { x, width, front, back, height } = CORRIDOR;
  const l = x - width / 2;
  const r = x + width / 2;
  const d = ROOM_DOOR_WIDTH / 2;
  return (
    <group>
      <Slab x={[l, r]} y={[-0.08, 0]} z={[back, front]} finish="floor" />
      <Slab x={[l, r]} y={[height, height + 0.1]} z={[back, front]} finish="ceiling" />
      <Slab x={[l - 0.2, l]} y={[0, height]} z={[back, front]} />
      <Slab x={[r, r + 0.2]} y={[0, height]} z={[back, front]} />
      <Slab x={[l, r]} y={[0, 0.1]} z={[back, front]} finish="trim" />
      {[front - 2, front - 5].map((z) => (
        <CeilingLight key={z} at={[x, height - 0.03, z]} size={[0.6, 0.9]} />
      ))}

      {/* The room's front wall, around its door. */}
      <Slab x={[ROOM.left, x - d]} y={[0, ROOM.height]} z={[ROOM.front - 0.15, ROOM.front]} />
      <Slab x={[x + d, ROOM.right]} y={[0, ROOM.height]} z={[ROOM.front - 0.15, ROOM.front]} />
      <Slab x={[x - d, x + d]} y={[2.2, ROOM.height]} z={[ROOM.front - 0.15, ROOM.front]} />
      <Slab x={[x - d - 0.08, x + d + 0.08]} y={[2.2, 2.28]} z={[ROOM.front - 0.18, ROOM.front + 0.03]} finish="trim" round={0.01} />
      <SwingDoor at={[x + d, 0, ROOM.front - 0.08]} width={ROOM_DOOR_WIDTH} height={2.2} hinge="right" open={doorOpen} />
    </group>
  );
});
