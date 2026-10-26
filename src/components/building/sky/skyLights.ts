/**
 * Tints Lighting.tsx's hemisphere, key and fill lights by the sky (outdoors
 * only; skyLook blends that in). Each light's own colour and intensity, as
 * first seen, is the baseline the tint multiplies, so day leaves them exactly
 * as declared.
 */

import * as THREE from "three";

import { skyLook } from "./look";

interface Baseline {
  color: THREE.Color;
  /** A hemisphere light's ground colour. */
  ground: THREE.Color | null;
  intensity: number;
}

const baselines = new WeakMap<THREE.Light, Baseline>();

function tint(light: THREE.Light, color: THREE.Color, factor: number) {
  let b = baselines.get(light);
  if (!b) {
    const ground = light instanceof THREE.HemisphereLight ? light.groundColor.clone() : null;
    b = { color: light.color.clone(), ground, intensity: light.intensity };
    baselines.set(light, b);
  }
  light.color.copy(b.color).multiply(color);
  if (b.ground && light instanceof THREE.HemisphereLight) light.groundColor.copy(b.ground).multiply(color);
  light.intensity = b.intensity * factor;
}

/** Call once a frame, after the sky has blended its look (Sky.tsx). */
export function tintBySky(hemi: THREE.HemisphereLight | null, key: THREE.DirectionalLight | null, fill: THREE.DirectionalLight | null) {
  const { color, value } = skyLook;
  if (hemi) tint(hemi, color.hemi, value.hemiFactor);
  if (key) tint(key, color.key, value.keyFactor);
  if (fill) tint(fill, color.fill, value.fillFactor);
}
