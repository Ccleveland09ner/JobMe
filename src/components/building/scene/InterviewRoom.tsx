"use client";

/**
 * The interview room, in three dimensions: design/mock Inteview session.png
 * redrawn in the toon palette. Whiteboard behind the interviewer, a window
 * on the left, a plant in the corner, the table between interviewer and
 * candidate with the desk mic and a folder on it.
 *
 * The mic lights teal while the candidate is being listened to, the same cue
 * as the SVG room's DeskMic.
 */

import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import * as THREE from "three";

import type { Speaker } from "@/components/room/Recruiter3D";
import { toonMaterial } from "@/components/three/toon";

import { TABLE, RECRUITER, ROOM } from "../world";
import { TableNotepad } from "./Objects";
import { Box, CeilingLight, Chair, InkEdges, Pane, PottedPlant, Scribbles, Slab, unitBox } from "./parts";

/** The desk mic. Reads the speaker every frame, so the room never re-renders for it. */
function DeskMic({ speaker, at }: { speaker: RefObject<Speaker>; at: [number, number, number] }) {
  const head = useRef<THREE.Mesh>(null);
  useFrame(({ invalidate }) => {
    const mesh = head.current;
    if (!mesh) return;
    const material = toonMaterial(speaker.current.state === "listening" ? "accent" : "surface");
    if (mesh.material !== material) {
      mesh.material = material;
      invalidate();
    }
  });
  return (
    <group position={at}>
      <Box size={[0.14, 0.02, 0.14]} at={[0, 0.01, 0]} color="ink" />
      <Box size={[0.02, 0.08, 0.02]} at={[0, 0.06, 0]} color="ink" />
      <mesh ref={head} geometry={unitBox} material={toonMaterial("surface")} position={[0, 0.14, 0]} scale={[0.06, 0.1, 0.06]}>
        <InkEdges />
      </mesh>
    </group>
  );
}

export function InterviewRoomScene({ speaker }: { speaker: RefObject<Speaker> }) {
  const { left, right, front, back, height } = ROOM;
  const tableTop = TABLE.height;
  return (
    <group>
      <Slab x={[left, right]} y={[-0.08, 0]} z={[back, front]} color="floor" />
      <Slab x={[left, right]} y={[height, height + 0.1]} z={[back, front]} color="surface" />
      <CeilingLight at={[TABLE.x, height - 0.03, TABLE.z]} size={[1.6, 0.4]} />

      <Slab x={[left - 0.2, left]} y={[0, height]} z={[back, front]} />
      <Slab x={[right, right + 0.2]} y={[0, height]} z={[back, front]} />
      <Slab x={[left, right]} y={[0, height]} z={[back - 0.2, back]} />
      <Slab x={[left, right]} y={[0.95, 1.0]} z={[back, back + 0.03]} color="trim" />
      <Pane at={[left + 0.02, 1.75, -20.6]} width={2.2} height={1.5} sideways />

      {/* Whiteboard behind the interviewer, with a few lines on it. */}
      <Slab x={[RECRUITER.x - 1.6, RECRUITER.x + 1.6]} y={[1.35, 2.55]} z={[back, back + 0.05]} color="trim" />
      <Slab x={[RECRUITER.x - 1.55, RECRUITER.x + 1.55]} y={[1.4, 2.5]} z={[back + 0.05, back + 0.07]} color="surface" />
      <Scribbles at={[RECRUITER.x - 1.3, 2.3, back + 0.09]} widths={[0.7, 0.55, 0.45]} />

      <PottedPlant at={[left + 0.55, 0, back + 0.6]} />

      {/* The table, the interviewer's chair, and what is on the table. */}
      <Slab
        x={[TABLE.x - TABLE.width / 2, TABLE.x + TABLE.width / 2]}
        y={[tableTop - 0.05, tableTop]}
        z={[TABLE.z - TABLE.depth / 2, TABLE.z + TABLE.depth / 2]}
        color="surface"
      />
      <Slab
        x={[TABLE.x - TABLE.width / 2 + 0.05, TABLE.x + TABLE.width / 2 - 0.05]}
        y={[0, tableTop - 0.05]}
        z={[TABLE.z + TABLE.depth / 2 - 0.08, TABLE.z + TABLE.depth / 2 - 0.04]}
        color="trim"
      />
      <Chair at={[RECRUITER.x, 0, RECRUITER.z - 0.05]} />
      <Chair at={[right - 0.7, 0, front - 1.2]} rotationY={-2.4} />

      {/* Desk mic, facing the candidate: lit while listening. */}
      <DeskMic speaker={speaker} at={[TABLE.x - 0.35, tableTop, TABLE.z - 0.1]} />
      {/* The interviewer's notepad: picked up to review the notes so far. */}
      <TableNotepad />
    </group>
  );
}
