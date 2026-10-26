/**
 * The illustrated character style (Look.style "toon"): three flat tones and
 * an ink outline. The building itself is lit (finishes.ts).
 */

import * as THREE from "three";

/** Silhouette thickness for the OutlineEffect. */
export const OUTLINE_THICKNESS = 0.005;

let gradient: THREE.DataTexture | null = null;

/** Three flat tones instead of smooth lighting. One texture, shared. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const steps = [150, 210, 255];
  const data = new Uint8Array(steps.flatMap((v) => [v, v, v, 255]));
  gradient = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}
