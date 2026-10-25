"use client";

/**
 * The building's construction kit: boxes, panes, plants and lights in the
 * finishes of finishes.ts. Positions are box centres, sizes full extents, in
 * metres. Everything receives shadows; furniture and props pass `cast`. Walls,
 * floors, ceilings and windows never cast, so the key light (Lighting.tsx)
 * reaches inside the rooms they close.
 */

import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

import { finishMaterial, type Finish } from "@/components/three/finishes";

import { box, crown } from "./shapes";

type Vec3 = [number, number, number];

export function Box({
  size,
  at,
  finish = "wall",
  rotation,
  round = 0,
  cast = false,
}: {
  size: Vec3;
  at: Vec3;
  finish?: Finish;
  rotation?: Vec3;
  /** Edge radius, in metres. */
  round?: number;
  cast?: boolean;
}) {
  const gl = useThree((s) => s.gl);
  return (
    <mesh
      geometry={box(size, round)}
      material={finishMaterial(gl, finish)}
      position={at}
      rotation={rotation}
      castShadow={cast}
      receiveShadow
    />
  );
}

/** A box spanning [x0,x1] × [y0,y1] × [z0,z1] — easier to read for walls. */
export function Slab({
  x,
  y,
  z,
  finish = "wall",
  round,
  cast,
}: {
  x: [number, number];
  y: [number, number];
  z: [number, number];
  finish?: Finish;
  round?: number;
  cast?: boolean;
}) {
  return (
    <Box
      size={[Math.abs(x[1] - x[0]), Math.abs(y[1] - y[0]), Math.abs(z[1] - z[0])]}
      at={[(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2]}
      finish={finish}
      round={round}
      cast={cast}
    />
  );
}

/** A framed window facing ±Z (or ±X when `sideways`): daylight from inside, dark glass from outside. */
export function Pane({
  at,
  width,
  height,
  sideways = false,
  frame = "trim",
  inside = false,
}: {
  at: Vec3;
  width: number;
  height: number;
  sideways?: boolean;
  frame?: Finish;
  inside?: boolean;
}) {
  const f = 0.07;
  const depth = 0.08;
  const s = (w: number, h: number, d: number): Vec3 => (sideways ? [d, h, w] : [w, h, d]);
  const o = (dx: number, dy: number): Vec3 => (sideways ? [at[0], at[1] + dy, at[2] + dx] : [at[0] + dx, at[1] + dy, at[2]]);
  return (
    <group>
      <Box size={s(width, height, depth * 0.5)} at={at} finish={inside ? "daylight" : "window"} />
      <Box size={s(width + f * 2, f, depth)} at={o(0, height / 2)} finish={frame} round={0.012} />
      <Box size={s(width + f * 2, f, depth)} at={o(0, -height / 2)} finish={frame} round={0.012} />
      <Box size={s(f, height, depth)} at={o(-width / 2, 0)} finish={frame} round={0.012} />
      <Box size={s(f, height, depth)} at={o(width / 2, 0)} finish={frame} round={0.012} />
      <Box size={s(f * 0.6, height, depth * 0.8)} at={o(0, 0)} finish={frame} round={0.01} />
    </group>
  );
}

const trunkGeometry = new THREE.CylinderGeometry(0.08, 0.12, 1, 10);
const potGeometry = new THREE.CylinderGeometry(0.21, 0.15, 0.45, 24);
const soilGeometry = new THREE.CylinderGeometry(0.19, 0.19, 0.02, 24);

/** Faceted leaves: one crown of `seed`, at `at`, stretched to `scale`. */
function Leaves({ seed, at, scale }: { seed: number; at: Vec3; scale: Vec3 }) {
  const gl = useThree((s) => s.gl);
  return (
    <mesh geometry={crown(seed)} material={finishMaterial(gl, "plant")} position={at} scale={scale} castShadow receiveShadow />
  );
}

/** A low-poly tree: a tapered trunk and a crown of three clumps. */
export function Tree({ at, scale = 1 }: { at: Vec3; scale?: number }) {
  const gl = useThree((s) => s.gl);
  return (
    <group position={at} scale={scale}>
      <mesh geometry={trunkGeometry} material={finishMaterial(gl, "trunk")} position={[0, 0.75, 0]} scale={[1, 1.5, 1]} castShadow receiveShadow />
      <Leaves seed={1} at={[0, 2.15, 0]} scale={[1, 1.1, 1]} />
      <Leaves seed={2} at={[0.45, 1.75, 0.2]} scale={[0.6, 0.55, 0.6]} />
      <Leaves seed={3} at={[-0.4, 1.85, -0.15]} scale={[0.55, 0.5, 0.55]} />
    </group>
  );
}

export function Bush({ at, scale = 1 }: { at: Vec3; scale?: number }) {
  return (
    <group position={at} scale={scale}>
      <Leaves seed={4} at={[0, 0.32, 0]} scale={[0.75, 0.42, 0.55]} />
      <Leaves seed={5} at={[0.35, 0.25, 0.05]} scale={[0.4, 0.3, 0.4]} />
    </group>
  );
}

/** A potted plant: a tapered pot, its soil, and two clumps of leaves. */
export function PottedPlant({ at }: { at: Vec3 }) {
  const gl = useThree((s) => s.gl);
  return (
    <group position={at}>
      <mesh geometry={potGeometry} material={finishMaterial(gl, "surface")} position={[0, 0.225, 0]} castShadow receiveShadow />
      <mesh geometry={soilGeometry} material={finishMaterial(gl, "soil")} position={[0, 0.44, 0]} receiveShadow />
      <Leaves seed={6} at={[0, 0.85, 0]} scale={[0.42, 0.5, 0.42]} />
      <Leaves seed={7} at={[0.16, 1.18, 0.05]} scale={[0.26, 0.36, 0.26]} />
    </group>
  );
}

/** A ceiling light panel centred at `at`: a white housing round a glowing diffuser. */
export function CeilingLight({ at, size = [1.4, 0.5] }: { at: Vec3; size?: [number, number] }) {
  return (
    <group position={at}>
      <Box size={[size[0], 0.05, size[1]]} at={[0, 0, 0]} finish="surface" round={0.012} />
      <Box size={[size[0] - 0.08, 0.012, size[1] - 0.08]} at={[0, -0.025, 0]} finish="light" />
    </group>
  );
}

/** Lines of "writing" for whiteboards and paper, as thin ink bars. */
export function Scribbles({ at, widths, gap = 0.12, facing = "z" }: { at: Vec3; widths: number[]; gap?: number; facing?: "z" | "y" }) {
  const lines = useMemo(() => widths.map((w, i) => ({ w, offset: -i * gap })), [widths, gap]);
  return (
    <group position={at}>
      {lines.map(({ w, offset }, i) =>
        facing === "z" ? (
          <Box key={i} size={[w, 0.022, 0.01]} at={[w / 2, offset, 0]} finish="ink" round={0.004} />
        ) : (
          <Box key={i} size={[w, 0.008, 0.022]} at={[w / 2, 0, -offset]} finish="ink" />
        ),
      )}
    </group>
  );
}
