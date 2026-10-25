"use client";

/** A door leaf hinged at `at`, swinging inward (−Z). Requests frames only while moving. */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { prefersReducedMotion } from "@/lib/frontend/motion";

import { Box } from "./parts";

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
          <Box size={[width - frame * 2, height - frame * 2, 0.03]} at={[cx, height / 2, 0]} finish="glass" />
          <Box size={[width, frame, 0.07]} at={[cx, height - frame / 2, 0]} finish="iron" round={0.01} />
          <Box size={[width, frame, 0.07]} at={[cx, frame / 2, 0]} finish="iron" round={0.01} />
          <Box size={[frame, height, 0.07]} at={[cx - (sign * (width - frame)) / 2, height / 2, 0]} finish="iron" round={0.01} />
          <Box size={[frame, height, 0.07]} at={[cx + (sign * (width - frame)) / 2, height / 2, 0]} finish="iron" round={0.01} />
          <Box size={[0.04, 0.5, 0.1]} at={[cx + sign * (width / 2 - 0.18), 1.05, 0.04]} finish="brass" round={0.015} />
        </>
      ) : (
        <>
          {/* Turned a quarter, so the grain runs up the door. */}
          <Box size={[height, width, 0.06]} at={[cx, height / 2, 0]} rotation={[0, 0, Math.PI / 2]} finish="wood" round={0.012} />
          <Box size={[0.16, 0.55, 0.08]} at={[cx, height * 0.68, 0]} finish="glass" />
          <Box size={[0.12, 0.04, 0.08]} at={[cx + sign * (width / 2 - 0.14), 1.0, 0.05]} finish="brass" round={0.015} />
        </>
      )}
    </group>
  );
}
