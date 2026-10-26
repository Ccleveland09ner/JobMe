"use client";

/**
 * The plaque over the front door: raised brass letters on a dark panel in a
 * stone-trim frame, standing on two brackets at the canopy's front edge,
 * where the street camera sees all of it over the canopy.
 */

import { useThree } from "@react-three/fiber";

import { finishMaterial } from "@/components/three/finishes";
import { letteringGeometry, letteringWidth, useLetteringFont } from "@/components/three/lettering";

import { Box } from "../scene/parts";
import { roundedSlab } from "../scene/shapes";
import { FACADE_Z } from "../world";
import { ENTRANCE_SIGN } from "./copy";

/** The canopy's top and front edge (scene/Street.tsx: 3.25 m up, 1.8 m out from the pavilion's face). */
const CANOPY = { top: 3.25, front: FACADE_Z + 0.7 + 1.8 } as const;
const LETTER = 0.2;
const PLAQUE = { height: 0.42, depth: 0.05, bevel: 0.01, panel: 0.01, lift: 0.07, inset: 0.3 } as const;
/** The frame's front face (roundedSlab: back at z = 0, the bevel on both faces), the frame centred on z = 0. */
const FRAME_FRONT = PLAQUE.depth / 2 + PLAQUE.bevel * 2;

export function EntranceSign() {
  const gl = useThree((s) => s.gl);
  const font = useLetteringFont();
  const letters = letteringGeometry(font, { text: ENTRANCE_SIGN, size: LETTER, depth: 0.012, anchor: "surface" });
  const width = letteringWidth(letters) + 0.5;
  const y = CANOPY.top + PLAQUE.lift + PLAQUE.height / 2;
  const z = CANOPY.front - PLAQUE.inset;
  return (
    <group position={[0, y, z]}>
      {/* The brackets it stands on. */}
      {[-1, 1].map((side) => (
        <Box
          key={side}
          size={[0.08, PLAQUE.lift, 0.08]}
          at={[side * (width / 2 - 0.25), -PLAQUE.height / 2 - PLAQUE.lift / 2, 0]}
          finish="iron"
          cast
        />
      ))}
      {/* The trim frame, the dark panel set into it, and the letters. */}
      <mesh
        geometry={roundedSlab({ w: width + 0.1, h: PLAQUE.height + 0.1, r: 0.04, depth: PLAQUE.depth, bevel: PLAQUE.bevel })}
        material={finishMaterial(gl, "trim")}
        position={[0, 0, -PLAQUE.depth / 2]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={roundedSlab({ w: width, h: PLAQUE.height, r: 0.03, depth: PLAQUE.panel })}
        material={finishMaterial(gl, "window")}
        position={[0, 0, FRAME_FRONT]}
        receiveShadow
      />
      <mesh geometry={letters} material={finishMaterial(gl, "brass", { decal: true })} position={[0, 0, FRAME_FRONT + PLAQUE.panel]} />
    </group>
  );
}
