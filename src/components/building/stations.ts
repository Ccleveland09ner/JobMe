/**
 * Where the user can be, and what they see from there.
 *
 * A station is a camera pose. Routes map to stations (stationForPath), and
 * the camera travels between them along fixed paths (pathBetween) — the user
 * is led, never steered. See docs/reverse-engineering/implementation-plan.md.
 */

import { CANDIDATE, CORRIDOR, DESK, FACADE_Z, LOBBY, RECRUITER, ROOM, SECRETARY } from "./world";

export type Station = "street" | "entrance" | "desk" | "corridor" | "room";

export interface Pose {
  position: [number, number, number];
  target: [number, number, number];
  /** Vertical field of view in landscape; portrait widens it (fovFor). */
  fov: number;
}

export const POSES: Record<Station, Pose> = {
  street: { position: [0, 1.7, FACADE_Z + 21], target: [0, 5.4, FACADE_Z], fov: 46 },
  entrance: { position: [1.4, 1.65, FACADE_Z + 6.2], target: [-0.4, 1.6, FACADE_Z], fov: 46 },
  desk: { position: [0.3, 1.8, DESK.z + 3.5], target: [SECRETARY.x, 0.95, SECRETARY.z], fov: 36 },
  corridor: { position: [CORRIDOR.x, 1.6, ROOM.front + 2.6], target: [CORRIDOR.x, 1.35, ROOM.front], fov: 48 },
  room: { position: [CANDIDATE.x, 1.36, CANDIDATE.z], target: [RECRUITER.x, 1.3, RECRUITER.z], fov: 36 },
};

/** Literal headings and announcements: meaningful without the metaphor. */
export const STATION_LABEL: Record<Station, string> = {
  street: "Outside the building",
  entrance: "At the front door",
  desk: "At the front desk",
  corridor: "In the corridor",
  room: "In the interview room",
};

/** In the lobby, lined up with the corridor: the turn between desk and corridor. */
const CORRIDOR_MOUTH: Pose = {
  position: [CORRIDOR.x, 1.6, LOBBY.back + 1.6],
  target: [CORRIDOR.x, 1.5, ROOM.front],
  fov: 48,
};

/** Waypoints between stations. Stops the camera cutting through walls. */
const WAYPOINTS: Partial<Record<`${Station}>${Station}`, Pose[]>> = {
  "street>desk": [POSES.entrance],
  "entrance>room": [POSES.desk, CORRIDOR_MOUTH, POSES.corridor],
  "street>room": [POSES.entrance, POSES.desk, CORRIDOR_MOUTH, POSES.corridor],
  "desk>room": [CORRIDOR_MOUTH, POSES.corridor],
  "desk>corridor": [CORRIDOR_MOUTH],
};

/** The poses visited going from `from` to `to`, ending at `to`. */
export function pathBetween(from: Station, to: Station): Pose[] {
  if (from === to) return [POSES[to]];
  const forward = WAYPOINTS[`${from}>${to}`];
  if (forward) return [...forward, POSES[to]];
  const back = WAYPOINTS[`${to}>${from}`];
  if (back) return [...back].reverse().concat(POSES[to]);
  return [POSES[to]];
}

const STATIONS: readonly Station[] = ["street", "entrance", "desk", "corridor", "room"];

/** Which station a route belongs to. Unknown routes stand at the desk. */
export function stationForPath(pathname: string): Station {
  // Development only: /dev/building/<station> stands at any station without
  // signing in (app/(building)/dev/building, a 404 in production).
  const dev = /^\/dev\/building\/([a-z]+)$/.exec(pathname)?.[1];
  if (dev && (STATIONS as readonly string[]).includes(dev)) return dev as Station;
  if (pathname === "/") return "street";
  if (pathname.startsWith("/login")) return "entrance";
  if (/^\/interview\/[^/]+$/.test(pathname) && pathname !== "/interview/new") return "room";
  return "desk";
}

/**
 * Narrow screens keep roughly the landscape horizontal view by widening the
 * vertical one, so the subject is not cropped off the sides of a phone.
 */
export function fovFor(pose: Pose, aspect: number): number {
  const minAspect = 1.3;
  if (aspect >= minAspect) return pose.fov;
  const half = (pose.fov * Math.PI) / 360;
  const widened = (2 * Math.atan((Math.tan(half) * minAspect) / aspect) * 180) / Math.PI;
  return Math.min(widened, 80);
}
