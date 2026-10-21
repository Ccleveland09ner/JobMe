"use client";

/**
 * The building's construction kit: boxes, panes and plants in the toon
 * palette. Everything is a closed solid (never a bare plane) so the
 * OutlineEffect's inverted hull draws a clean ink edge around it.
 *
 * Positions are box CENTRES, sizes are full extents, in metres.
 */

import { Edges } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

import { EDGE_THRESHOLD, EDGE_WIDTH, glassMaterial, PALETTE, toonMaterial, type PaletteColor } from "@/components/three/toon";

type Vec3 = [number, number, number];

/**
 * Ink along every hard corner of the mesh it sits in — the crease lines the
 * silhouette outline cannot draw. Put it inside any scenery <mesh>.
 */
export function InkEdges({ threshold = EDGE_THRESHOLD }: { threshold?: number }) {
  return <Edges lineWidth={EDGE_WIDTH} threshold={threshold} color={PALETTE.ink} />;
}

export const unitBox = new THREE.BoxGeometry(1, 1, 1);

export function Box({
  size,
  at,
  color = "wall",
  rotation,
}: {
  size: Vec3;
  at: Vec3;
  color?: PaletteColor | string;
  rotation?: Vec3;
}) {
  return (
    <mesh geometry={unitBox} material={toonMaterial(color)} position={at} scale={size} rotation={rotation}>
      <InkEdges />
    </mesh>
  );
}

/** A box spanning [x0,x1] × [y0,y1] × [z0,z1] — easier to read for walls. */
export function Slab({
  x,
  y,
  z,
  color = "wall",
}: {
  x: [number, number];
  y: [number, number];
  z: [number, number];
  color?: PaletteColor | string;
}) {
  return (
    <Box
      size={[Math.abs(x[1] - x[0]), Math.abs(y[1] - y[0]), Math.abs(z[1] - z[0])]}
      at={[(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2]}
      color={color}
    />
  );
}

/** A framed window pane facing ±Z (or ±X when `sideways`). */
export function Pane({
  at,
  width,
  height,
  sideways = false,
  frame = "trim",
}: {
  at: Vec3;
  width: number;
  height: number;
  sideways?: boolean;
  frame?: PaletteColor;
}) {
  const f = 0.07;
  const depth = 0.08;
  const s = (w: number, h: number, d: number): Vec3 => (sideways ? [d, h, w] : [w, h, d]);
  const o = (dx: number, dy: number): Vec3 => (sideways ? [at[0], at[1] + dy, at[2] + dx] : [at[0] + dx, at[1] + dy, at[2]]);
  return (
    <group>
      <mesh geometry={unitBox} material={glassMaterial} position={at} scale={s(width, height, depth * 0.5)}>
        <InkEdges />
      </mesh>
      <Box size={s(width + f * 2, f, depth)} at={o(0, height / 2)} color={frame} />
      <Box size={s(width + f * 2, f, depth)} at={o(0, -height / 2)} color={frame} />
      <Box size={s(f, height, depth)} at={o(-width / 2, 0)} color={frame} />
      <Box size={s(f, height, depth)} at={o(width / 2, 0)} color={frame} />
      <Box size={s(f * 0.6, height, depth)} at={o(0, 0)} color={frame} />
    </group>
  );
}

const leafGeometry = new THREE.IcosahedronGeometry(1, 0);

/** A low-poly tree: a trunk and a faceted crown. */
export function Tree({ at, scale = 1 }: { at: Vec3; scale?: number }) {
  return (
    <group position={at} scale={scale}>
      <Box size={[0.22, 1.4, 0.22]} at={[0, 0.7, 0]} color="wood" />
      <mesh geometry={leafGeometry} material={toonMaterial("plant")} position={[0, 2.1, 0]} scale={[1.1, 1.3, 1.1]}>
        <InkEdges />
      </mesh>
    </group>
  );
}

export function Bush({ at, scale = 1 }: { at: Vec3; scale?: number }) {
  return (
    <mesh
      geometry={leafGeometry}
      material={toonMaterial("plant")}
      position={[at[0], at[1] + 0.35 * scale, at[2]]}
      scale={[0.8 * scale, 0.5 * scale, 0.6 * scale]}
    >
      <InkEdges />
    </mesh>
  );
}

/** A potted plant, as in the interview-room drawing. */
export function PottedPlant({ at }: { at: Vec3 }) {
  return (
    <group position={at}>
      <Box size={[0.42, 0.45, 0.42]} at={[0, 0.225, 0]} color="surface" />
      <mesh geometry={leafGeometry} material={toonMaterial("plant")} position={[0, 0.85, 0]} scale={[0.45, 0.55, 0.45]}>
        <InkEdges />
      </mesh>
      <mesh geometry={leafGeometry} material={toonMaterial("plant")} position={[0.18, 1.2, 0.05]} scale={[0.28, 0.4, 0.28]}>
        <InkEdges />
      </mesh>
    </group>
  );
}


/** A flat ceiling light panel, centred at `at`. */
export function CeilingLight({ at, size = [1.4, 0.5] }: { at: Vec3; size?: [number, number] }) {
  return <Box size={[size[0], 0.05, size[1]]} at={at} color="surface" />;
}

/** Lines of "writing" for whiteboards and paper, as thin ink bars. */
export function Scribbles({ at, widths, gap = 0.12, facing = "z" }: { at: Vec3; widths: number[]; gap?: number; facing?: "z" | "y" }) {
  const lines = useMemo(() => widths.map((w, i) => ({ w, offset: -i * gap })), [widths, gap]);
  return (
    <group position={at}>
      {lines.map(({ w, offset }, i) =>
        facing === "z" ? (
          <Box key={i} size={[w, 0.022, 0.01]} at={[w / 2, offset, 0]} color="ink" />
        ) : (
          <Box key={i} size={[w, 0.008, 0.022]} at={[w / 2, 0, -offset]} color="ink" />
        ),
      )}
    </group>
  );
}
