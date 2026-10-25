"use client";

/** The interview room: whiteboard, window, plant, and the table with the mic and notepad. */

import { memo, type RefObject } from "react";

import type { Speaker } from "@/components/room/types";

import { TABLE, RECRUITER, ROOM } from "../world";
import { DeskMic } from "./DeskMic";
import { TableNotepad } from "./Objects";
import { OfficeChair } from "./OfficeChair";
import { CeilingLight, Pane, PottedPlant, Scribbles, Slab } from "./parts";

/** Memoized: its props rarely change, and it reads no context itself. */
export const InterviewRoomScene = memo(function InterviewRoomScene({ speaker }: { speaker: RefObject<Speaker> }) {
  const { left, right, front, back, height } = ROOM;
  const tableTop = TABLE.height;
  return (
    <group>
      <Slab x={[left, right]} y={[-0.08, 0]} z={[back, front]} finish="floor" />
      <Slab x={[left, right]} y={[height, height + 0.1]} z={[back, front]} finish="ceiling" />
      <CeilingLight at={[TABLE.x, height - 0.03, TABLE.z]} size={[1.6, 0.4]} />

      <Slab x={[left - 0.2, left]} y={[0, height]} z={[back, front]} />
      <Slab x={[right, right + 0.2]} y={[0, height]} z={[back, front]} />
      <Slab x={[left, right]} y={[0, height]} z={[back - 0.2, back]} />
      {/* A rail along the back wall: it throws a thin shadow line under it. */}
      <Slab x={[left, right]} y={[0.95, 1.0]} z={[back, back + 0.03]} finish="trim" round={0.008} cast />
      <Pane at={[left + 0.02, 1.75, -20.6]} width={2.2} height={1.5} sideways inside />

      {/* Whiteboard behind the interviewer, in a frame, with a few lines on it. */}
      <Slab x={[RECRUITER.x - 1.6, RECRUITER.x + 1.6]} y={[1.35, 2.55]} z={[back, back + 0.05]} finish="trim" round={0.015} cast />
      <Slab x={[RECRUITER.x - 1.55, RECRUITER.x + 1.55]} y={[1.4, 2.5]} z={[back + 0.05, back + 0.07]} finish="whiteboard" />
      <Scribbles at={[RECRUITER.x - 1.3, 2.3, back + 0.09]} widths={[0.7, 0.55, 0.45]} />

      <PottedPlant at={[left + 0.55, 0, back + 0.6]} />

      {/* The table, the interviewer's chair, and what is on the table. */}
      <Slab
        x={[TABLE.x - TABLE.width / 2, TABLE.x + TABLE.width / 2]}
        y={[tableTop - 0.05, tableTop]}
        z={[TABLE.z - TABLE.depth / 2, TABLE.z + TABLE.depth / 2]}
        finish="surface"
        round={0.015}
        cast
      />
      <Slab
        x={[TABLE.x - TABLE.width / 2 + 0.05, TABLE.x + TABLE.width / 2 - 0.05]}
        y={[0, tableTop - 0.05]}
        z={[TABLE.z + TABLE.depth / 2 - 0.08, TABLE.z + TABLE.depth / 2 - 0.04]}
        finish="trim"
        round={0.01}
        cast
      />
      <OfficeChair at={[RECRUITER.x, 0, RECRUITER.z - 0.05]} />
      <OfficeChair at={[right - 0.7, 0, front - 1.2]} rotationY={-2.4} />

      {/* The candidate's mic, centred in front of them. */}
      <DeskMic speaker={speaker} at={[TABLE.x, tableTop, TABLE.z + TABLE.depth / 2 - 0.12]} />
      {/* The interviewer's notepad: picked up to review the notes so far. */}
      <TableNotepad />
    </group>
  );
});
