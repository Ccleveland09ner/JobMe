"use client";

/** A door leaf hinged at `at`, swinging inward (−Z). Requests frames only while moving. */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { glassMaterial } from "@/components/three/toon";
import { prefersReducedMotion } from "@/lib/voice/audio-graph";

import { Box, InkEdges, unitBox } from "./parts";

const OPEN_ANGLE = 1.45;

export function SwingDoor({
  at,
  width,
  height,
  hinge,
  open,
  glass = false,
}: {
  at: [number, number, number];
  width: number;
  height: number;
  hinge: "left" | "right";
  open: boolean;
  glass?: boolean;
}) {
  const leaf = useRef<THREE.Group>(null);
  const sign = hinge === "left" ? 1 : -1;

  useFrame(({ invalidate }, delta) => {
    const g = leaf.current;
    if (!g) return;
    const goal = open ? sign * OPEN_ANGLE : 0;
    const diff = goal - g.rotation.y;
    if (Math.abs(diff) < 1e-3) {
      g.rotation.y = goal;
      return;
    }
    g.rotation.y = prefersReducedMotion() ? goal : g.rotation.y + diff * (1 - Math.exp(-delta * 5));
    invalidate();
  });

  const cx = (sign * width) / 2;
  const frame = 0.08;
  return (
    <group ref={leaf} position={at}>
      {glass ? (
        <>
          <mesh
            geometry={unitBox}
            material={glassMaterial}
            position={[cx, height / 2, 0]}
            scale={[width - frame * 2, height - frame * 2, 0.03]}
          >
            <InkEdges />
          </mesh>
          <Box size={[width, frame, 0.07]} at={[cx, height - frame / 2, 0]} color="ink" />
          <Box size={[width, frame, 0.07]} at={[cx, frame / 2, 0]} color="ink" />
          <Box size={[frame, height, 0.07]} at={[cx - (sign * (width - frame)) / 2, height / 2, 0]} color="ink" />
          <Box size={[frame, height, 0.07]} at={[cx + (sign * (width - frame)) / 2, height / 2, 0]} color="ink" />
          <Box size={[0.04, 0.5, 0.1]} at={[cx + sign * (width / 2 - 0.18), 1.05, 0.04]} color="trim" />
        </>
      ) : (
        <>
          <Box size={[width, height, 0.06]} at={[cx, height / 2, 0]} color="wood" />
          <mesh
            geometry={unitBox}
            material={glassMaterial}
            position={[cx, height * 0.68, 0]}
            scale={[0.16, 0.55, 0.08]}
          >
            <InkEdges />
          </mesh>
          <Box size={[0.12, 0.04, 0.08]} at={[cx + sign * (width / 2 - 0.14), 1.0, 0.05]} color="trim" />
        </>
      )}
    </group>
  );
}
