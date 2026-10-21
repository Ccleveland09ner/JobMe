/**
 * The illustrated look, shared by everything drawn in WebGL: flat toon
 * shading in three tones, ink lines, and the app's palette.
 *
 * Two kinds of ink line, together giving every form a drawn edge:
 *   - the silhouette, around each object's outline (OutlineRenderer.tsx);
 *   - creases, along every hard corner of the scenery, including the ones
 *     inside a silhouette — where a wall meets the floor, the front edge of a
 *     desk (InkEdges in building/scene/parts.tsx).
 * Scenery surfaces are drawn pushed back a hair (polygonOffset) so the crease
 * lines sit cleanly on top of the faces they border instead of flickering.
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

/**
 * One toon material per colour, cached: scenery built from dozens of boxes
 * shares a handful of materials. Never mutate the result — it is shared.
 */
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
