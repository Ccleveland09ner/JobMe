"use client";

/** Outside: the plaza and the building's front, after the campus drawing. */

import * as THREE from "three";

import { glassMaterial, toonMaterial } from "@/components/three/toon";

import { DOOR, FACADE_Z } from "../world";
import { Box, Bush, InkEdges, Pane, Slab, Tree, unitBox } from "./parts";
import { SwingDoor } from "./SwingDoor";

const WING_HEIGHT = 7;
const PAVILION = { half: 3.4, height: 9, depth: 0.7 } as const;
const FACE = FACADE_Z + PAVILION.depth;
const archGeometry = new THREE.CircleGeometry(1.35, 16, 0, Math.PI);

function WingWindows({ side }: { side: 1 | -1 }) {
  const xs = [4.6, 6.4, 8.2, 10, 11.8];
  return (
    <>
      {xs.flatMap((x) =>
        [2.0, 4.9].map((y) => <Pane key={`${x}-${y}`} at={[side * x, y, FACADE_Z + 0.06]} width={0.9} height={1.5} />),
      )}
    </>
  );
}

export function Street({ doorsOpen }: { doorsOpen: boolean }) {
  const d = DOOR.width / 2;
  return (
    <group>
      {/* Ground: lawn, the path to the door, and the steps. */}
      <Slab x={[-30, 30]} y={[-0.1, 0]} z={[FACADE_Z, 40]} color="grass" />
      <Slab x={[-2.2, 2.2]} y={[0, 0.02]} z={[FACADE_Z + 3.4, 40]} color="path" />
      <Slab x={[-2.6, 2.6]} y={[0, 0.12]} z={[FACADE_Z + 2.8, FACADE_Z + 3.4]} color="stone" />
      <Slab x={[-2.6, 2.6]} y={[0, 0.06]} z={[FACADE_Z + 2.2, FACADE_Z + 2.8]} color="stone" />
      <Slab x={[-2.6, 2.6]} y={[0, 0.02]} z={[FACADE_Z, FACADE_Z + 2.2]} color="stone" />

      {/* Wings, either side of the pavilion. */}
      <Slab x={[-14, -PAVILION.half]} y={[0, WING_HEIGHT]} z={[FACADE_Z - 0.3, FACADE_Z]} color="stone" />
      <Slab x={[PAVILION.half, 14]} y={[0, WING_HEIGHT]} z={[FACADE_Z - 0.3, FACADE_Z]} color="stone" />
      <Slab x={[-14.2, -PAVILION.half]} y={[WING_HEIGHT, WING_HEIGHT + 0.35]} z={[FACADE_Z - 0.3, FACADE_Z + 0.25]} color="trim" />
      <Slab x={[PAVILION.half, 14.2]} y={[WING_HEIGHT, WING_HEIGHT + 0.35]} z={[FACADE_Z - 0.3, FACADE_Z + 0.25]} color="trim" />
      <WingWindows side={-1} />
      <WingWindows side={1} />

      {/* Pavilion: a block standing proud of the wings, the doors recessed into it. */}
      <Slab x={[-PAVILION.half, -d]} y={[0, PAVILION.height]} z={[FACADE_Z - 0.3, FACE]} color="stone" />
      <Slab x={[d, PAVILION.half]} y={[0, PAVILION.height]} z={[FACADE_Z - 0.3, FACE]} color="stone" />
      <Slab x={[-d, d]} y={[DOOR.height, PAVILION.height]} z={[FACADE_Z - 0.3, FACE]} color="stone" />
      <Slab x={[-PAVILION.half - 0.2, PAVILION.half + 0.2]} y={[PAVILION.height, PAVILION.height + 0.4]} z={[FACADE_Z - 0.3, FACE + 0.25]} color="trim" />
      {/* The arched window on the pavilion face: a pane, its round top, and glazing bars. */}
      <Slab x={[-1.5, 1.5]} y={[3.85, 5.45]} z={[FACE, FACE + 0.04]} color="trim" />
      <mesh geometry={unitBox} material={glassMaterial} position={[0, 4.65, FACE + 0.06]} scale={[2.7, 1.5, 0.04]}>
        <InkEdges />
      </mesh>
      <mesh geometry={archGeometry} material={glassMaterial} position={[0, 5.4, FACE + 0.06]}>
        <InkEdges />
      </mesh>
      <Box size={[0.08, 2.9, 0.06]} at={[0, 5.2, FACE + 0.1]} color="trim" />
      <Box size={[2.7, 0.08, 0.06]} at={[0, 4.65, FACE + 0.1]} color="trim" />
      <Box size={[2.7, 0.08, 0.06]} at={[0, 5.4, FACE + 0.1]} color="trim" />
      <Box size={[3.0, 0.14, 0.12]} at={[0, 3.8, FACE + 0.06]} color="trim" />

      {/* Canopy over the doors, on two columns. */}
      <Slab x={[-2.3, 2.3]} y={[2.95, 3.25]} z={[FACE, FACE + 1.8]} color="trim" />
      <Box size={[0.32, 2.95, 0.32]} at={[-2.0, 1.475, FACE + 1.55]} color="stone" />
      <Box size={[0.32, 2.95, 0.32]} at={[2.0, 1.475, FACE + 1.55]} color="stone" />

      {/* The front doors: glass, opening inward when the user walks in. */}
      <SwingDoor at={[-d, 0, FACADE_Z - 0.15]} width={d} height={DOOR.height} hinge="left" open={doorsOpen} glass />
      <SwingDoor at={[d, 0, FACADE_Z - 0.15]} width={d} height={DOOR.height} hinge="right" open={doorsOpen} glass />

      {/* Lamp posts either side of the steps. */}
      {[-3.4, 3.4].map((x) => (
        <group key={x} position={[x, 0, FACADE_Z + 2.9]}>
          <Box size={[0.12, 3.1, 0.12]} at={[0, 1.55, 0]} color="ink" />
          <Box size={[0.36, 0.5, 0.36]} at={[0, 3.3, 0]} color="ink" />
          <mesh geometry={unitBox} material={toonMaterial("surface")} position={[0, 3.3, 0]} scale={[0.26, 0.36, 0.38]}>
            <InkEdges />
          </mesh>
        </group>
      ))}

      {/* Hedges along the facade, trees framing the plaza. */}
      {[-12, -10, -8, -6, -4.4, 4.4, 6, 8, 10, 12].map((x) => (
        <Bush key={x} at={[x, 0, FACADE_Z + 1.2]} scale={1.3} />
      ))}
      {[-15, -9, 9, 15].map((x) => (
        <Tree key={x} at={[x, 0, FACADE_Z + 5]} scale={1.5} />
      ))}
      {[-18, 18].map((x) => (
        <Tree key={x} at={[x, 0, FACADE_Z + 1.5]} scale={2} />
      ))}
    </group>
  );
}
