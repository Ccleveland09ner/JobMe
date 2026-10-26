/**
 * The 3D colours. PALETTE mirrors the tokens in globals.css (WebGL can't read
 * CSS variables); change a colour in both places.
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
  // The interview room: --color-chalkboard, --color-terracotta, --color-notepad in globals.css.
  chalkboard: "#2f5d4a",
  terracotta: "#c2673f",
  notepad: "#e2a93a",
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
