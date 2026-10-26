/**
 * Where the landing page's things stand on the street, in metres (world.ts
 * axes: +Z toward the camera), and the camera's close-up on each poster.
 * Placed so a portrait phone at the street pose still sees all of them.
 */

import { POSES, type Pose } from "../stations";
import { FACADE_Z } from "../world";
import type { Poster } from "./copy";

type Vec3 = [number, number, number];

export const POSTER_ORDER: readonly Poster[] = ["about", "guide"];

/** Named actions (building.setAction): the 3D things and their hidden buttons run the same ones. */
export const LANDING_ACTIONS = {
  stepInside: "landing:step-inside",
  poster: (poster: Poster) => `landing:poster:${poster}`,
} as const;

/** The beaming tile on the path, between the camera (z 21) and the porch. */
export const TILE = { x: 0, z: FACADE_Z + 11, size: 1.5 } as const;

/** A poster board: its face's size and how high its bottom edge stands (m). */
export const BOARD = { width: 1.3, height: 1.1, bottom: 0.72 } as const;

const STREET = POSES.street.position;

/** Turned this share of the way toward the street camera: angled, not square on. */
const TOWARD_CAMERA = 0.6;

interface PosterPlace {
  x: number;
  z: number;
  /** Rotation about Y. */
  turn: number;
}

const place = (x: number, z: number): PosterPlace => ({ x, z, turn: Math.atan2(STREET[0] - x, STREET[2] - z) * TOWARD_CAMERA });

/** Left by the hedge, nearer the building; right beside the path, nearer the camera. */
export const POSTERS: Record<Poster, PosterPlace> = {
  about: place(-4.6, FACADE_Z + 5),
  guide: place(3.4, FACADE_Z + 9),
};

/** The middle of a poster's face, in the world. */
export function boardCentre(poster: Poster): Vec3 {
  const p = POSTERS[poster];
  return [p.x, BOARD.bottom + BOARD.height / 2, p.z];
}

/** How far in front of a poster the close-up stands (m). */
const CLOSE_UP_DISTANCE = 3;

/** Square on to each poster; narrow screens step back just enough to fit its width. */
export const POSTER_CLOSE_UPS: Record<Poster, Pose> = {
  about: closeUp("about"),
  guide: closeUp("guide"),
};

function closeUp(poster: Poster): Pose {
  const [x, y, z] = boardCentre(poster);
  const turn = POSTERS[poster].turn;
  return {
    position: [x + Math.sin(turn) * CLOSE_UP_DISTANCE, y, z + Math.cos(turn) * CLOSE_UP_DISTANCE],
    target: [x, y, z],
    fov: 40,
    fit: BOARD.width / 2 + 0.04,
  };
}

/** Glides between the street and the posters take this long (s). */
export const POSTER_GLIDE_SECONDS = 1;

export function isPoster(name: string | null): name is Poster {
  return name === "about" || name === "guide";
}
