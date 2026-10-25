"use client";

/** The lobby: front desk, secretary's chair, notice board and the corridor opening. */

import { useThree } from "@react-three/fiber";
import { memo, Suspense } from "react";
import * as THREE from "three";

import { finishMaterial, type Finish } from "@/components/three/finishes";

import { CORRIDOR, DESK, FACADE_Z, LOBBY, SECRETARY } from "../world";
import { DeskObjects, NoticeBoard } from "./Objects";
import { OfficeChair } from "./OfficeChair";
import { CeilingLight, Pane, PottedPlant, Slab } from "./parts";

const potGeometry = new THREE.CylinderGeometry(0.045, 0.04, 0.11, 24);
const penGeometry = new THREE.CylinderGeometry(0.0045, 0.0045, 0.15, 8);
const PENS: { finish: Finish; tilt: [number, number] }[] = [
  { finish: "accent", tilt: [0.12, 0.1] },
  { finish: "pin", tilt: [-0.1, 0.06] },
  { finish: "ink", tilt: [0.02, -0.14] },
];

/** A pot of pens on the counter, standing on `top`. */
function PenPot({ x, top, z }: { x: number; top: number; z: number }) {
  const gl = useThree((s) => s.gl);
  return (
    <group position={[x, top, z]}>
      <mesh geometry={potGeometry} material={finishMaterial(gl, "iron")} position={[0, 0.055, 0]} castShadow receiveShadow />
      {PENS.map(({ finish, tilt }) => (
        <mesh
          key={finish}
          geometry={penGeometry}
          material={finishMaterial(gl, finish)}
          position={[tilt[0] * 0.12, 0.12, tilt[1] * 0.12]}
          rotation={[tilt[1], 0, -tilt[0]]}
          castShadow
        />
      ))}
    </group>
  );
}

/** Memoized: its props rarely change, and it reads no context itself. */
export const Lobby = memo(function Lobby() {
  const { left, right, back, height } = LOBBY;
  const cl = CORRIDOR.x - CORRIDOR.width / 2;
  const cr = CORRIDOR.x + CORRIDOR.width / 2;
  const deskBack = DESK.z - DESK.depth;
  const half = DESK.width / 2;
  return (
    <group>
      {/* Floor, rug and ceiling. */}
      <Slab x={[left, right]} y={[-0.08, 0]} z={[back, FACADE_Z - 0.3]} finish="floor" />
      <Slab x={[-2.4, 2.4]} y={[0, 0.015]} z={[DESK.z + 0.6, -1.2]} finish="rug" round={0.006} />
      <Slab x={[left, right]} y={[height, height + 0.1]} z={[back, FACADE_Z - 0.3]} finish="ceiling" />
      {[-3, 0, 3].map((x) => (
        <CeilingLight key={x} at={[x, height - 0.03, -4]} />
      ))}

      {/* Side walls, with windows, and the back wall around the corridor opening. */}
      <Slab x={[left - 0.2, left]} y={[0, height]} z={[back, FACADE_Z - 0.3]} />
      <Slab x={[right, right + 0.2]} y={[0, height]} z={[back, FACADE_Z - 0.3]} />
      <Pane at={[left + 0.02, 1.8, -3]} width={1.6} height={1.6} sideways inside />
      <Pane at={[right - 0.02, 1.8, -3]} width={1.6} height={1.6} sideways inside />
      <Slab x={[left, cl]} y={[0, height]} z={[back - 0.2, back]} />
      <Slab x={[cr, right]} y={[0, height]} z={[back - 0.2, back]} />
      <Slab x={[cl, cr]} y={[CORRIDOR.height, height]} z={[back - 0.2, back]} />
      {/* Skirting along the walls, in the trim colour. */}
      <Slab x={[left, right]} y={[0, 0.12]} z={[back, back + 0.03]} finish="trim" round={0.006} />

      {/* The front desk: a dark plinth set back, the laminate counter with its teal band, a varnished wood top. */}
      <Slab x={[-half + 0.06, half - 0.06]} y={[0, 0.1]} z={[deskBack + 0.04, DESK.z - 0.06]} finish="ink" />
      <Slab x={[-half, half]} y={[0.1, DESK.height]} z={[deskBack, DESK.z]} finish="surface" round={0.02} cast />
      <Slab x={[-half + 0.005, half - 0.005]} y={[0.48, 0.55]} z={[DESK.z - 0.02, DESK.z + 0.012]} finish="accent" round={0.008} />
      <Slab
        x={[-half - 0.05, half + 0.05]}
        y={[DESK.height, DESK.height + 0.06]}
        z={[deskBack - 0.05, DESK.z + 0.08]}
        finish="wood"
        round={0.014}
        cast
      />
      <OfficeChair at={[SECRETARY.x, 0, SECRETARY.z - 0.05]} />
      {/* A pen pot, and the desk objects (they wait for the lettering font). */}
      <PenPot x={1.45} top={DESK.height + 0.06} z={DESK.z - 0.4} />
      <Suspense fallback={null}>
        <DeskObjects />
      </Suspense>

      {/* Back wall: the settings notice board, and a plant. */}
      <Suspense fallback={null}>
        <NoticeBoard />
      </Suspense>
      <PottedPlant at={[right - 0.6, 0, back + 0.6]} />
      <PottedPlant at={[left + 0.6, 0, -1.2]} />

      {/* A bench by the window, for waiting. */}
      <Slab x={[right - 0.6, right - 0.1]} y={[0.42, 0.5]} z={[-5, -2]} finish="wood" round={0.02} cast />
      <Slab x={[right - 0.55, right - 0.15]} y={[0, 0.42]} z={[-4.9, -4.7]} finish="iron" round={0.012} cast />
      <Slab x={[right - 0.55, right - 0.15]} y={[0, 0.42]} z={[-2.3, -2.1]} finish="iron" round={0.012} cast />
    </group>
  );
});
