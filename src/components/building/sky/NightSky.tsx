"use client";

/**
 * Stars and a small moon, around the camera with the dome; they fade in at
 * dusk and night. Drawn before the clouds, so clouds pass in front.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { skyLook } from "./look";
import { MOON, seededRandom, SOFT_DOT, useCanvasTexture } from "./textures";

const STARS = { count: 900, radius: 90, lowest: 0.12, size: 2.4 } as const;
/** Up and right, above the wing's roofline and clear of the title. */
const MOON_AT = new THREE.Vector3(0.42, 0.4, -0.81).normalize().multiplyScalar(85);
const MOON_SIZE = 6;
const BEHIND_CLOUDS = -10;

function starGeometry(): THREE.BufferGeometry {
  const random = seededRandom(2027);
  const positions = new Float32Array(STARS.count * 3);
  const colors = new Float32Array(STARS.count * 3);
  for (let i = 0; i < STARS.count; i++) {
    // Even over the sky above `lowest` (sine of the elevation).
    const y = STARS.lowest + (1 - STARS.lowest) * random();
    const around = random() * Math.PI * 2;
    const flat = Math.sqrt(1 - y * y);
    positions.set([Math.cos(around) * flat * STARS.radius, y * STARS.radius, Math.sin(around) * flat * STARS.radius], i * 3);
    // Mostly faint, a few bright; a touch of blue.
    const b = 0.3 + 0.7 * random() ** 3;
    colors.set([b * 0.92, b * 0.95, b], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function NightSky() {
  const dpr = useThree((s) => s.viewport.dpr);
  const dot = useCanvasTexture(SOFT_DOT);
  const moonMap = useCanvasTexture(MOON);
  const [geometry] = useState(starGeometry);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const stars = useRef<THREE.Points>(null);
  const starMaterial = useRef<THREE.PointsMaterial>(null);
  const moon = useRef<THREE.Sprite>(null);
  const moonMaterial = useRef<THREE.SpriteMaterial>(null);

  useFrame(() => {
    const { stars: s, moon: m } = skyLook.value;
    if (stars.current && starMaterial.current) {
      stars.current.visible = s > 0.01;
      starMaterial.current.opacity = s;
    }
    if (moon.current && moonMaterial.current) {
      moon.current.visible = m > 0.01;
      moonMaterial.current.opacity = m;
    }
  });

  return (
    <>
      <points ref={stars} geometry={geometry} renderOrder={BEHIND_CLOUDS} frustumCulled={false} visible={false}>
        <pointsMaterial
          ref={starMaterial}
          map={dot}
          // Pixels on screen, whatever the distance.
          size={STARS.size * dpr}
          sizeAttenuation={false}
          vertexColors
          transparent
          opacity={0}
          depthWrite={false}
          fog={false}
          toneMapped={false}
        />
      </points>
      <sprite ref={moon} position={MOON_AT} scale={MOON_SIZE} renderOrder={BEHIND_CLOUDS} visible={false}>
        <spriteMaterial ref={moonMaterial} map={moonMap} transparent opacity={0} depthWrite={false} fog={false} toneMapped={false} />
      </sprite>
    </>
  );
}
