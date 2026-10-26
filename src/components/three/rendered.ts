/**
 * Physically based materials, studio lit, with no ink outline: the building's
 * finishes (finishes.ts) and the props beside the characters (chairs, desk
 * mic). Cached per renderer and spec; never mutate one.
 */

import * as THREE from "three";

import { studioEnvironment } from "./environment";
import { cornerShadeTexture, detailTexture, type DetailTexture } from "./textures";

export interface RenderedSpec {
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  /** How strongly the studio environment lights it; ENV_INTENSITY by default. */
  env?: number;
  /** A grey detail map multiplied into the colour (textures.ts). */
  texture?: DetailTexture;
  /** How strongly the detail map bumps the surface; 0 for none. */
  bump?: number;
  /** See-through, from 0 (invisible) to 1. */
  opacity?: number;
  /** Shading toward each face's edges, read on uv1 (box() geometry only). */
  cornerShade?: boolean;
  /** Drawn in front of the surface it lies on (painted lettering). */
  decal?: boolean;
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
      envMapIntensity: spec.env ?? ENV_INTENSITY,
    });
    if (spec.texture) {
      material.map = detailTexture(spec.texture);
      if (spec.bump) {
        material.bumpMap = material.map;
        material.bumpScale = spec.bump;
      }
    }
    if (spec.opacity !== undefined) {
      material.transparent = true;
      material.opacity = spec.opacity;
    }
    if (spec.cornerShade) material.aoMap = cornerShadeTexture();
    if (spec.decal) {
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1;
      material.polygonOffsetUnits = -1;
    }
    // No ink line: the shading gives a rendered prop its form.
    material.userData.outlineParameters = { visible: false };
    byKey.set(key, material);
  }
  return material;
}
