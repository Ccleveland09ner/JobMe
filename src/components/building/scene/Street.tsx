"use client";

/** Outside: the plaza and the building's front, after the campus drawing. */

import { useThree } from "@react-three/fiber";
import { memo } from "react";
import * as THREE from "three";

import { finishMaterial } from "@/components/three/finishes";

import { StreetLantern } from "../sky/StreetLantern";
import { DOOR, FACADE_Z } from "../world";
import { Box, Bush, Pane, Slab, Tree } from "./parts";
import { SwingDoor } from "./SwingDoor";

const WING_HEIGHT = 7;
const PAVILION = { half: 3.4, height: 9, depth: 0.7 } as const;
const FACE = FACADE_Z + PAVILION.depth;
const archGeometry = new THREE.CircleGeometry(1.35, 24, 0, Math.PI);
const postGeometry = new THREE.CylinderGeometry(0.05, 0.07, 3.1, 16);

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

/** A square column on a plinth, with a capital; `x` along the facade, `z` its centre. */
function Column({ x, z, height }: { x: number; z: number; height: number }) {
  return (
    <>
      <Box size={[0.44, 0.14, 0.44]} at={[x, 0.07, z]} finish="trim" round={0.02} cast />
      <Box size={[0.32, height - 0.26, 0.32]} at={[x, height / 2, z]} finish="stone" round={0.025} cast />
      <Box size={[0.42, 0.12, 0.42]} at={[x, height - 0.06, z]} finish="trim" round={0.02} cast />
    </>
  );
}

/** A lamp post: a tapered iron post, and a lantern between its corner posts, lit from dusk. */
function LampPost({ x, z }: { x: number; z: number }) {
  const gl = useThree((s) => s.gl);
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={postGeometry} material={finishMaterial(gl, "iron")} position={[0, 1.55, 0]} castShadow receiveShadow />
      <Box size={[0.3, 0.05, 0.3]} at={[0, 3.08, 0]} finish="iron" round={0.012} cast />
      <StreetLantern at={[0, 3.29, 0]} />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => <Box key={`${sx}${sz}`} size={[0.03, 0.38, 0.03]} at={[sx * 0.14, 3.29, sz * 0.14]} finish="iron" cast />),
      )}
      <Box size={[0.4, 0.06, 0.4]} at={[0, 3.5, 0]} finish="iron" round={0.02} cast />
    </group>
  );
}

/** Memoized: its props rarely change, and it reads no context itself. */
export const Street = memo(function Street({ doorsOpen }: { doorsOpen: boolean }) {
  const gl = useThree((s) => s.gl);
  const d = DOOR.width / 2;
  const darkGlass = finishMaterial(gl, "window");
  return (
    <group>
      {/* Ground: lawn, the path to the door, and the steps. */}
      <Slab x={[-30, 30]} y={[-0.1, 0]} z={[FACADE_Z, 40]} finish="grass" />
      <Slab x={[-2.2, 2.2]} y={[0, 0.02]} z={[FACADE_Z + 3.4, 40]} finish="path" />
      <Slab x={[-2.6, 2.6]} y={[0, 0.12]} z={[FACADE_Z + 2.8, FACADE_Z + 3.4]} finish="stone" round={0.012} cast />
      <Slab x={[-2.6, 2.6]} y={[0, 0.06]} z={[FACADE_Z + 2.2, FACADE_Z + 2.8]} finish="stone" round={0.012} cast />
      <Slab x={[-2.6, 2.6]} y={[0, 0.02]} z={[FACADE_Z, FACADE_Z + 2.2]} finish="stone" round={0.006} />

      {/* Wings, either side of the pavilion. They cast no shadow: it would fall inside the lobby. */}
      <Slab x={[-14, -PAVILION.half]} y={[0, WING_HEIGHT]} z={[FACADE_Z - 0.3, FACADE_Z]} finish="stone" />
      <Slab x={[PAVILION.half, 14]} y={[0, WING_HEIGHT]} z={[FACADE_Z - 0.3, FACADE_Z]} finish="stone" />
      <Slab x={[-14.2, -PAVILION.half]} y={[WING_HEIGHT, WING_HEIGHT + 0.35]} z={[FACADE_Z - 0.3, FACADE_Z + 0.25]} finish="trim" round={0.02} />
      <Slab x={[PAVILION.half, 14.2]} y={[WING_HEIGHT, WING_HEIGHT + 0.35]} z={[FACADE_Z - 0.3, FACADE_Z + 0.25]} finish="trim" round={0.02} />
      <WingWindows side={-1} />
      <WingWindows side={1} />

      {/* Pavilion: a block standing proud of the wings, the doors recessed into it. */}
      <Slab x={[-PAVILION.half, -d]} y={[0, PAVILION.height]} z={[FACADE_Z - 0.3, FACE]} finish="stone" />
      <Slab x={[d, PAVILION.half]} y={[0, PAVILION.height]} z={[FACADE_Z - 0.3, FACE]} finish="stone" />
      <Slab x={[-d, d]} y={[DOOR.height, PAVILION.height]} z={[FACADE_Z - 0.3, FACE]} finish="stone" />
      <Slab
        x={[-PAVILION.half - 0.2, PAVILION.half + 0.2]}
        y={[PAVILION.height, PAVILION.height + 0.4]}
        z={[FACADE_Z - 0.3, FACE + 0.25]}
        finish="trim"
        round={0.025}
      />
      {/* The arched window on the pavilion face: a pane, its round top, and glazing bars. */}
      <Slab x={[-1.5, 1.5]} y={[3.85, 5.45]} z={[FACE, FACE + 0.04]} finish="trim" />
      <Box size={[2.7, 1.5, 0.04]} at={[0, 4.65, FACE + 0.06]} finish="window" />
      <mesh geometry={archGeometry} material={darkGlass} position={[0, 5.4, FACE + 0.06]} />
      <Box size={[0.08, 2.9, 0.06]} at={[0, 5.2, FACE + 0.1]} finish="trim" round={0.012} />
      <Box size={[2.7, 0.08, 0.06]} at={[0, 4.65, FACE + 0.1]} finish="trim" round={0.012} />
      <Box size={[2.7, 0.08, 0.06]} at={[0, 5.4, FACE + 0.1]} finish="trim" round={0.012} />
      <Box size={[3.0, 0.14, 0.12]} at={[0, 3.8, FACE + 0.06]} finish="trim" round={0.02} />

      {/* Canopy over the doors, on two columns. */}
      <Slab x={[-2.3, 2.3]} y={[2.95, 3.25]} z={[FACE, FACE + 1.8]} finish="trim" round={0.03} cast />
      <Column x={-2.0} z={FACE + 1.55} height={2.95} />
      <Column x={2.0} z={FACE + 1.55} height={2.95} />

      {/* The front doors: glass, opening inward when the user walks in. */}
      <SwingDoor at={[-d, 0, FACADE_Z - 0.15]} width={d} height={DOOR.height} hinge="left" open={doorsOpen} glass />
      <SwingDoor at={[d, 0, FACADE_Z - 0.15]} width={d} height={DOOR.height} hinge="right" open={doorsOpen} glass />

      {/* Lamp posts either side of the steps. */}
      {[-3.4, 3.4].map((x) => (
        <LampPost key={x} x={x} z={FACADE_Z + 2.9} />
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
});
