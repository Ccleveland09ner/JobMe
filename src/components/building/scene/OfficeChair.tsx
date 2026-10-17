"use client";

/**
 * An ergonomic office chair, after design/Modern Ergonomic Office Chair.png:
 * a padded seat and a padded, slightly reclined back with two horizontal
 * seams, T-shaped armrests, a gas-lift column and a five-star base on castors.
 *
 * Rendered in full 3D (three/rendered.ts) rather than toon, because the
 * characters who sit in it are; black fabric over black plastic.
 *
 * Faces +Z (rotate the group to turn it). Seat top at 0.52 m, the height the
 * seated characters' animation expects.
 */

import { RoundedBox } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

import { renderedMaterial } from "@/components/three/rendered";

type Vec3 = [number, number, number];

const legGeometry = new THREE.BoxGeometry(1, 1, 1);
const casterGeometry = new THREE.CylinderGeometry(1, 1, 1, 16);
const columnGeometry = new THREE.CylinderGeometry(1, 1, 1, 20);

export function OfficeChair({ at, rotationY = 0 }: { at: Vec3; rotationY?: number }) {
  const gl = useThree((s) => s.gl);
  const m = useMemo(
    () => ({
      fabric: renderedMaterial(gl, { color: "#2a2c30", roughness: 0.95 }),
      plastic: renderedMaterial(gl, { color: "#18191c", roughness: 0.55 }),
      seam: renderedMaterial(gl, { color: "#111214", roughness: 1 }),
      metal: renderedMaterial(gl, { color: "#3a3d42", roughness: 0.35, metalness: 0.6 }),
    }),
    [gl],
  );

  // The five-star base: legs and castors at 72° steps.
  const legs = [0, 1, 2, 3, 4].map((i) => (i * 2 * Math.PI) / 5);

  return (
    <group position={at} rotation={[0, rotationY, 0]}>
      {/* Base */}
      <mesh geometry={columnGeometry} material={m.plastic} position={[0, 0.075, 0]} scale={[0.05, 0.05, 0.05]} />
      {legs.map((a) => (
        <group key={a} rotation={[0, a, 0]}>
          <mesh geometry={legGeometry} material={m.plastic} position={[0, 0.065, 0.15]} rotation={[0.08, 0, 0]} scale={[0.045, 0.03, 0.3]} />
          <mesh
            geometry={casterGeometry}
            material={m.plastic}
            position={[0, 0.028, 0.29]}
            rotation={[0, 0, Math.PI / 2]}
            scale={[0.028, 0.03, 0.028]}
          />
        </group>
      ))}

      {/* Gas lift: a shroud and the chrome column, then the seat mechanism. */}
      <mesh geometry={columnGeometry} material={m.plastic} position={[0, 0.15, 0]} scale={[0.036, 0.12, 0.036]} />
      <mesh geometry={columnGeometry} material={m.metal} position={[0, 0.3, 0]} scale={[0.024, 0.2, 0.024]} />
      <mesh geometry={legGeometry} material={m.plastic} position={[0, 0.41, 0]} scale={[0.22, 0.04, 0.22]} />

      {/* Seat cushion */}
      <RoundedBox args={[0.52, 0.1, 0.5]} radius={0.045} smoothness={4} position={[0, 0.47, 0.01]} material={m.fabric} />

      {/* Back: a support spine, then the padded back with two seams, reclined a touch. */}
      <mesh geometry={legGeometry} material={m.plastic} position={[0, 0.5, -0.24]} scale={[0.07, 0.12, 0.04]} />
      <group position={[0, 0.86, -0.27]} rotation={[-0.12, 0, 0]}>
        <RoundedBox args={[0.47, 0.58, 0.08]} radius={0.04} smoothness={4} material={m.fabric} />
        <mesh geometry={legGeometry} material={m.seam} position={[0, 0.09, 0.041]} scale={[0.4, 0.006, 0.004]} />
        <mesh geometry={legGeometry} material={m.seam} position={[0, -0.06, 0.041]} scale={[0.4, 0.006, 0.004]} />
      </group>

      {/* T-shaped armrests */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.3, 0, 0]}>
          <mesh geometry={legGeometry} material={m.plastic} position={[0, 0.6, -0.04]} scale={[0.035, 0.2, 0.05]} />
          <RoundedBox args={[0.075, 0.032, 0.26]} radius={0.014} smoothness={3} position={[0, 0.71, 0]} material={m.plastic} />
        </group>
      ))}
    </group>
  );
}
