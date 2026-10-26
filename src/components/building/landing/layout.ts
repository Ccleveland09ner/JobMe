/**
 * Where the landing page's things stand on the street, in metres (world.ts
 * axes: +Z toward the camera), and the camera's close-up on each signpost.
 * Placed so a portrait phone at the street pose still sees all of them.
 */

import { POSES, type Pose } from "../stations";

/** Portrait screens (stations.ts PORTRAIT): the reading view stacks its words below the face, which fills the width. */
export { PORTRAIT } from "../stations";
import { FACADE_Z } from "../world";
import type { Poster } from "./copy";

type Vec3 = [number, number, number];

export const POSTER_ORDER: readonly Poster[] = ["about", "guide"];

/** Named actions (building.setAction): the words in the scene and their hidden buttons run the same ones. */
export const LANDING_ACTIONS = {
  stepInside: "landing:step-inside",
  poster: (poster: Poster) => `landing:poster:${poster}`,
  next: "landing:next",
  back: "landing:back",
  close: "landing:close",
  /** A click on the scene that hit nothing you can use (BuildingCanvas onPointerMissed). */
  outside: "scene:missed",
} as const;

/**
 * The front path (scene/Street.tsx): its top, its far end, its left edge. Its
 * texture is 0.4 m pavers laid from the far end and the left edge (uvs in metres).
 */
export const PATH = { top: 0.02, farZ: 40, leftX: -2.2, paver: 0.4 } as const;

/** The paver that leads in: the middle column, about 10 m from the street camera. */
export const TILE = { x: 0, z: PATH.farZ - PATH.paver * 72.5 } as const;

/** A signpost's stone face (the writing goes on it), and how high its bottom edge stands (m). */
export const FACE = { width: 1.1, height: 1.75, bottom: 0.55 } as const;

const STREET = POSES.street.position;

/** Turned this share of the way toward the street camera: angled, not square on. */
const TOWARD_CAMERA = 0.6;

interface PostPlace {
  x: number;
  z: number;
  /** Rotation about Y. */
  turn: number;
  /** Top of the cap (m): the two differ a little. */
  height: number;
}

const place = (x: number, z: number, height: number): PostPlace => ({
  x,
  z,
  turn: Math.atan2(STREET[0] - x, STREET[2] - z) * TOWARD_CAMERA,
  height,
});

/** Left by the hedge, nearer the building; right beside the path, nearer the camera. */
export const POSTS: Record<Poster, PostPlace> = {
  about: place(-4.6, FACADE_Z + 5, 2.75),
  guide: place(3.4, FACADE_Z + 9, 2.6),
};

export function faceCentre(poster: Poster): Vec3 {
  const p = POSTS[poster];
  return [p.x, FACE.bottom + FACE.height / 2, p.z];
}

/** How far in front of a signpost the close-up stands (m), on wide screens. */
const CLOSE_UP_DISTANCE = 3.8;

/** Square on to each signpost; on portrait screens, near enough that its face fills the width. */
export const POSTER_CLOSE_UPS: Record<Poster, Pose> = {
  about: closeUp("about"),
  guide: closeUp("guide"),
};

function closeUp(poster: Poster): Pose {
  const [x, y, z] = faceCentre(poster);
  const turn = POSTS[poster].turn;
  return {
    position: [x + Math.sin(turn) * CLOSE_UP_DISTANCE, y, z + Math.cos(turn) * CLOSE_UP_DISTANCE],
    target: [x, y, z],
    fov: 40,
    // A little past the face's frame, so CLOSE above it and NEXT or BACK below it stay on screen.
    fill: FACE.width / 2 + 0.13,
  };
}

/** Glides between the street and the signposts take this long (s). */
export const POSTER_GLIDE_SECONDS = 1;

export function isPoster(name: string | null): name is Poster {
  return name === "about" || name === "guide";
}
