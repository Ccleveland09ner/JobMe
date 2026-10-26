"use client";

/**
 * The building's light: a warm key from above and to the right that casts soft
 * shadows, a cool fill from the left, and a sky-and-floor bounce. The key's
 * shadow box is centred on what the camera looks at and sized to how far away
 * that is: the whole facade from the street, a pin's shadow at the notice
 * board. It is snapped to its texels so shadow edges hold still while the
 * camera moves. Outdoors, the sky tints all three by time of day (sky/).
 * Measured on an integrated GPU, so keep additions cheap.
 */

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";

import { tintBySky } from "../sky/skyLights";

/**
 * Toward the key light, from the scene: high, to the right and a little in
 * front, so shadows fall to the left of things, where every station sees them.
 */
const KEY_FROM = new THREE.Vector3(9, 10, 5).normalize();
const KEY_DISTANCE = 30;
const SHADOW_MAP = 1024;
/** Half the shadow box's width: this many times the camera's distance to what it looks at, within limits (m). */
const REACH = { perMetre: 1.3, min: 3, max: 14 } as const;

/** The shadow camera's axes (as DirectionalLightShadow aims it): right and up. */
const RIGHT = new THREE.Vector3().crossVectors(THREE.Object3D.DEFAULT_UP, KEY_FROM).normalize();
const UP = new THREE.Vector3().crossVectors(KEY_FROM, RIGHT);

const scratch = { look: new THREE.Vector3(), focus: new THREE.Vector3() };

export function Lighting() {
  const key = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);

  useLayoutEffect(() => {
    const light = key.current;
    if (!light) return;
    const shadow = light.shadow;
    shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    shadow.camera.near = KEY_DISTANCE - 20;
    shadow.camera.far = KEY_DISTANCE + 20;
    shadow.bias = -0.0001;
    shadow.radius = 2;
    shadow.intensity = 0.85;
  }, []);

  useFrame(({ camera }) => {
    tintBySky(hemi.current, key.current, fill.current);
    const light = key.current;
    if (!light) return;
    // What the camera looks at (set by CameraRig), or a little ahead of it.
    const target = camera.userData.target as THREE.Vector3 | undefined;
    const focus = target
      ? scratch.focus.copy(target)
      : scratch.focus.copy(camera.position).addScaledVector(camera.getWorldDirection(scratch.look), 5);
    const reach = THREE.MathUtils.clamp(camera.position.distanceTo(focus) * REACH.perMetre, REACH.min, REACH.max);

    const shadow = light.shadow;
    if (Math.abs(shadow.camera.right - reach) > 0.01) {
      Object.assign(shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach });
      shadow.camera.updateProjectionMatrix();
    }
    const texel = (2 * reach) / SHADOW_MAP;
    // About a texel off each surface: no acne, and small gaps (a note on cork) still shade.
    shadow.normalBias = texel;

    // Snap across the light to whole shadow texels, so edges don't crawl as the camera moves.
    const r = Math.round(focus.dot(RIGHT) / texel) * texel - focus.dot(RIGHT);
    const u = Math.round(focus.dot(UP) / texel) * texel - focus.dot(UP);
    focus.addScaledVector(RIGHT, r).addScaledVector(UP, u);
    light.position.copy(focus).addScaledVector(KEY_FROM, KEY_DISTANCE);
    light.target.position.copy(focus);
    light.target.updateMatrixWorld();
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={["#fff8ee", "#c9a98a", 0.9]} />
      <directionalLight ref={key} color="#fff1df" intensity={2.8} castShadow />
      {/* The fill: no shadows, so it never needs a shadow map. */}
      <directionalLight ref={fill} position={[-6, 3, 5]} color="#edf1f7" intensity={1.0} />
    </>
  );
}
