/**
 * Physically based materials for props rendered in full 3D, like the
 * characters (room/Recruiter3D.tsx, Look.style "rendered"): the chairs and
 * the desk mic sit right next to them, so they share the same studio
 * lighting (environment.ts) and skip the ink outline.
 *
 * Cached per renderer and spec; never mutate a result — it is shared.
 */

import * as THREE from "three";

import { studioEnvironment } from "./environment";

export interface RenderedSpec {
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
}

/** How strongly the studio environment lights rendered props (as the characters). */
const ENV_INTENSITY = 0.45;

const cache = new WeakMap<THREE.WebGLRenderer, Map<string, THREE.MeshStandardMaterial>>();

export function renderedMaterial(gl: THREE.WebGLRenderer, spec: RenderedSpec): THREE.MeshStandardMaterial {
  let byKey = cache.get(gl);
  if (!byKey) {
    byKey = new Map();
    cache.set(gl, byKey);
  }
  const key = JSON.stringify(spec);
  let material = byKey.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: spec.color,
      roughness: spec.roughness ?? 0.8,
      metalness: spec.metalness ?? 0,
      emissive: spec.emissive ?? "#000000",
      emissiveIntensity: spec.emissiveIntensity ?? 0,
      envMap: studioEnvironment(gl),
      envMapIntensity: ENV_INTENSITY,
    });
    // No ink line: the shading gives a rendered prop its form.
    material.userData.outlineParameters = { visible: false };
    byKey.set(key, material);
  }
  return material;
}
