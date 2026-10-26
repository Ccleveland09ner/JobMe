"use client";

/**
 * A street lamp's lantern: off by day, soft at dusk, full at night. It glows
 * (emissive, with an additive halo) and lights the steps with a point light.
 * The two lamps' point lights are always there, only at 0 by day: adding or
 * removing a light would recompile every material in the building.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { studioEnvironment } from "@/components/three/environment";
import { PALETTE } from "@/components/three/palette";

import { skyLook } from "./look";
import { SOFT_DOT, useCanvasTexture } from "./textures";

type Vec3 = [number, number, number];

const LAMP_LIGHT = "#ffcf8f";
/** Emissive intensity off and fully on; the point light's at full (cd); the halo's opacity at full. */
const LAMP = { off: 0.12, on: 1.8, light: 8, halo: 0.9, haloSize: 2.2, reach: 9 } as const;

/** The lantern's shape, as the "light" finish box it replaces. */
const lanternGeometry = new THREE.BoxGeometry(0.26, 0.36, 0.26);

/** Its own material, shared by both lanterns: the "light" finish is also the ceiling panels', which mustn't change. */
const materials = new WeakMap<THREE.WebGLRenderer, THREE.MeshStandardMaterial>();
function lanternMaterial(gl: THREE.WebGLRenderer): THREE.MeshStandardMaterial {
  let material = materials.get(gl);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: PALETTE.surface,
      roughness: 0.6,
      emissive: LAMP_LIGHT,
      emissiveIntensity: LAMP.off,
      envMap: studioEnvironment(gl),
      envMapIntensity: 0.25,
    });
    materials.set(gl, material);
  }
  return material;
}

export function StreetLantern({ at }: { at: Vec3 }) {
  const gl = useThree((s) => s.gl);
  const dot = useCanvasTexture(SOFT_DOT);
  const lantern = useRef<THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>>(null);
  const halo = useRef<THREE.Sprite>(null);
  const haloMaterial = useRef<THREE.SpriteMaterial>(null);
  const light = useRef<THREE.PointLight>(null);

  useFrame(() => {
    const on = skyLook.value.lamp;
    // Shared by both lanterns, which write the same value.
    if (lantern.current) lantern.current.material.emissiveIntensity = LAMP.off + (LAMP.on - LAMP.off) * on;
    if (light.current) light.current.intensity = LAMP.light * on;
    if (halo.current && haloMaterial.current) {
      halo.current.visible = on > 0.01;
      haloMaterial.current.opacity = LAMP.halo * on;
    }
  });

  return (
    <>
      <mesh ref={lantern} geometry={lanternGeometry} material={lanternMaterial(gl)} position={at} receiveShadow />
      <sprite ref={halo} position={at} scale={LAMP.haloSize} visible={false}>
        <spriteMaterial
          ref={haloMaterial}
          map={dot}
          color={LAMP_LIGHT}
          blending={THREE.AdditiveBlending}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      {/* A little in front of the lantern, toward the steps. */}
      <pointLight ref={light} position={[at[0], at[1] - 0.1, at[2] + 0.2]} color={LAMP_LIGHT} intensity={0} distance={LAMP.reach} decay={2} />
    </>
  );
}
