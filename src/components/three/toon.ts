/**
 * The illustrated look, shared by everything drawn in WebGL: flat toon
 * shading in three tones, ink outlines (OutlineRenderer.tsx), and the app's
 * palette.
 * Ref: docs/PRD-JobMe-MVP.md > Look and Feel ("friendly and intentional, not
 *      photoreal"; one confident accent)
 *
 * WebGL cannot read CSS variables, so PALETTE mirrors the tokens in
 * globals.css. Change a colour in both places or not at all.
 */

import * as THREE from "three";

export const PALETTE = {
  ink: "#1c1b1a",
  accent: "#0f766e",
  surface: "#ffffff",
  bg: "#faf8f5",
  // Scene colours: --color-wall … --color-plant in globals.css.
  sky: "#f3ece0",
  wall: "#efe6d8",
  trim: "#d8c9b2",
  stone: "#e2d6c3",
  floor: "#c49a6c",
  wood: "#8a5a3b",
  glass: "#bcd9d5",
  plant: "#5b8a52",
  grass: "#9cbc72",
  path: "#d3c8b6",
  fabric: "#2f3e46",
} as const;

export type PaletteColor = keyof typeof PALETTE;

export const INK = new THREE.Color(PALETTE.ink);
export const TEAL = new THREE.Color(PALETTE.accent);

/** Outline thickness for the OutlineEffect — the recruiter's original value. */
export const OUTLINE_THICKNESS = 0.004;

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

const materials = new Map<string, THREE.MeshToonMaterial>();

/**
 * One toon material per colour, cached: scenery built from dozens of boxes
 * shares a handful of materials. Never mutate the result — it is shared.
 */
export function toonMaterial(color: PaletteColor | string): THREE.MeshToonMaterial {
  const hex = color in PALETTE ? PALETTE[color as PaletteColor] : color;
  let material = materials.get(hex);
  if (!material) {
    material = new THREE.MeshToonMaterial({ color: hex, gradientMap: toonGradient() });
    materials.set(hex, material);
  }
  return material;
}

/** A see-through pane (windows, door glass). Outlined like everything else. */
export const glassMaterial = new THREE.MeshToonMaterial({
  color: PALETTE.glass,
  gradientMap: toonGradient(),
  transparent: true,
  opacity: 0.55,
});
