/**
 * The illustrated look: three-tone toon shading, ink lines and the palette.
 * PALETTE mirrors the tokens in globals.css (WebGL can't read CSS variables);
 * change a colour in both places.
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
  // Things on the desk and the wall: --color-leather … --color-pin in globals.css.
  leather: "#6b2f2a",
  manila: "#e3c27e",
  cork: "#c79a62",
  brass: "#c9a24a",
  pin: "#d64b3c",
  paper: "#fffdf7",
  noteYellow: "#fff4c2",
  // The clipboard on the desk: --color-board, --color-clipmetal, --color-rule.
  board: "#a9774c",
  clipmetal: "#c5ccd0",
  rule: "#c8d5e2",
} as const;

export type PaletteColor = keyof typeof PALETTE;

export const INK = new THREE.Color(PALETTE.ink);
export const TEAL = new THREE.Color(PALETTE.accent);

/** Silhouette thickness for the OutlineEffect. */
export const OUTLINE_THICKNESS = 0.005;

/** Crease lines along hard corners, in CSS pixels. */
export const EDGE_WIDTH = 1.6;
/** Faces meeting at more than this angle, in degrees, get a crease line. */
export const EDGE_THRESHOLD = 15;

/** Push faces back a hair so crease lines win the depth test at shared edges. */
const BEHIND_LINES = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 } as const;

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

/** One cached toon material per colour. Shared: never mutate. */
export function toonMaterial(color: PaletteColor | string): THREE.MeshToonMaterial {
  const hex = color in PALETTE ? PALETTE[color as PaletteColor] : color;
  let material = materials.get(hex);
  if (!material) {
    material = new THREE.MeshToonMaterial({ color: hex, gradientMap: toonGradient(), ...BEHIND_LINES });
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
  ...BEHIND_LINES,
});
