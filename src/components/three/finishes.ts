/**
 * The building's surfaces, by name: each is a rendered material (rendered.ts)
 * in a palette colour, with a detail texture where the surface has one.
 * Words that must read as UI (floating labels) use lettering.ts's unlit
 * sign materials instead.
 */

import type * as THREE from "three";

import { PALETTE } from "./palette";
import { renderedMaterial, type RenderedSpec } from "./rendered";

/** Bump maps cost a little on every pixel they cover: only small things seen close keep one. */
export const FINISHES = {
  // Rooms and the street.
  wall: { color: PALETTE.wall, roughness: 0.92, texture: "plaster", cornerShade: true },
  ceiling: { color: PALETTE.surface, roughness: 0.95, texture: "plaster", cornerShade: true },
  floor: { color: PALETTE.floor, roughness: 0.55, texture: "planks", cornerShade: true },
  trim: { color: PALETTE.trim, roughness: 0.55 },
  stone: { color: PALETTE.stone, roughness: 0.9, texture: "stone" },
  grass: { color: PALETTE.grass, roughness: 1, texture: "grass" },
  path: { color: PALETTE.path, roughness: 0.9, texture: "pavers" },
  glass: { color: PALETTE.glass, roughness: 0.05, opacity: 0.45, env: 1.2 },
  /** A window seen from outside: dark glass that reflects. */
  window: { color: PALETTE.fabric, roughness: 0.15, env: 1.2 },
  /** A window seen from inside: daylight. */
  daylight: { color: PALETTE.sky, roughness: 1, emissive: PALETTE.sky, emissiveIntensity: 0.85 },
  /** Ceiling panels and lanterns: they glow, they don't light anything. */
  light: { color: PALETTE.surface, roughness: 0.6, emissive: "#fff2dc", emissiveIntensity: 0.85 },
  rug: { color: PALETTE.trim, roughness: 1, texture: "weave" },
  plant: { color: PALETTE.plant, roughness: 0.75 },
  trunk: { color: PALETTE.wood, roughness: 0.95 },
  soil: { color: "#4a3426", roughness: 1 },

  // Furniture and fittings.
  wood: { color: PALETTE.wood, roughness: 0.45, texture: "grain", bump: 0.3 },
  surface: { color: PALETTE.surface, roughness: 0.45 },
  whiteboard: { color: PALETTE.surface, roughness: 0.15, env: 0.8 },
  /** The interview room's board: matte green slate, dusted with chalk. */
  chalkboard: { color: PALETTE.chalkboard, roughness: 0.92, texture: "plaster" },
  chalk: { color: PALETTE.paper, roughness: 1 },
  terracotta: { color: PALETTE.terracotta, roughness: 0.85, texture: "plaster" },
  /** The interviewer's notepad: a mustard cloth cover. */
  notepad: { color: PALETTE.notepad, roughness: 0.95, texture: "weave", bump: 0.3 },
  petal: { color: PALETTE.pin, roughness: 0.6 },
  pollen: { color: PALETTE.brass, roughness: 0.7 },
  accent: { color: PALETTE.accent, roughness: 0.35 },
  ink: { color: PALETTE.ink, roughness: 0.7 },
  /** Powder-coated metal: door frames, lamp posts, legs. */
  iron: { color: PALETTE.ink, roughness: 0.4, metalness: 0.6, env: 0.8 },
  fabric: { color: PALETTE.fabric, roughness: 1, texture: "weave", bump: 0.3 },

  // On the desk and the board.
  leather: { color: PALETTE.leather, roughness: 0.5, texture: "leather", bump: 0.4 },
  paper: { color: PALETTE.paper, roughness: 0.95, texture: "paper" },
  noteYellow: { color: PALETTE.noteYellow, roughness: 0.95, texture: "paper" },
  /** The sides of a block of pages. */
  pageEdge: { color: PALETTE.paper, roughness: 0.95, texture: "pages" },
  manila: { color: PALETTE.manila, roughness: 0.85, texture: "paper" },
  cork: { color: PALETTE.cork, roughness: 1, texture: "cork", bump: 0.8 },
  board: { color: PALETTE.board, roughness: 0.5, texture: "hardboard", bump: 0.2 },
  brass: { color: PALETTE.brass, roughness: 0.3, metalness: 1, env: 1 },
  clipmetal: { color: PALETTE.clipmetal, roughness: 0.25, metalness: 1, env: 1 },
  pin: { color: PALETTE.pin, roughness: 0.25 },
  rule: { color: PALETTE.rule, roughness: 0.9 },
} satisfies Record<string, RenderedSpec>;

export type Finish = keyof typeof FINISHES;

/** The studio environment's share of the light on a surface, unless its finish says (characters get 0.45). */
const ENV = 0.25;

/** One shared material per renderer, finish and variant; never mutate it. */
export function finishMaterial(
  gl: THREE.WebGLRenderer,
  name: Finish,
  { decal = false }: { decal?: boolean } = {},
): THREE.MeshStandardMaterial {
  const spec: RenderedSpec = { env: ENV, ...FINISHES[name] };
  return renderedMaterial(gl, decal ? { ...spec, decal } : spec);
}
