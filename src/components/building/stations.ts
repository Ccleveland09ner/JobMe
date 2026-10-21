/** Stations (camera poses), the routes that map to them, and the paths between. */

import { BOARD_NOTES, CANDIDATE, CORRIDOR, DESK, FACADE_Z, LOBBY, NOTEBOARD, RECRUITER, ROOM, SECRETARY, type BoardNote } from "./world";

export type Station = "street" | "entrance" | "desk" | "noteboard" | "corridor" | "room";

export interface Pose {
  position: [number, number, number];
  target: [number, number, number];
  /** Vertical field of view in landscape; portrait widens it (fovFor). */
  fov: number;
  /** Half-width (m) to keep in view at the target; narrow screens step back. */
  fit?: number;
}

export const POSES: Record<Station, Pose> = {
  street: { position: [0, 1.7, FACADE_Z + 21], target: [0, 5.4, FACADE_Z], fov: 46 },
  entrance: { position: [1.4, 1.65, FACADE_Z + 6.2], target: [-0.4, 1.6, FACADE_Z], fov: 46 },
  desk: { position: [0.3, 1.8, DESK.z + 3.5], target: [SECRETARY.x, 0.95, SECRETARY.z], fov: 36 },
  // Square on to the board, close enough to use its notes.
  noteboard: {
    position: [(NOTEBOARD.left + NOTEBOARD.right) / 2, (NOTEBOARD.bottom + NOTEBOARD.top) / 2, NOTEBOARD.z + 2.35],
    target: [(NOTEBOARD.left + NOTEBOARD.right) / 2, (NOTEBOARD.bottom + NOTEBOARD.top) / 2, NOTEBOARD.z],
    fov: 40,
    fit: (NOTEBOARD.right - NOTEBOARD.left) / 2 + 0.06,
  },
  corridor: { position: [CORRIDOR.x, 1.6, ROOM.front + 2.6], target: [CORRIDOR.x, 1.35, ROOM.front], fov: 48 },
  room: { position: [CANDIDATE.x, 1.36, CANDIDATE.z], target: [RECRUITER.x, 1.3, RECRUITER.z], fov: 36 },
};

/** Literal headings and announcements: meaningful without the metaphor. */
export const STATION_LABEL: Record<Station, string> = {
  street: "Outside the building",
  entrance: "At the front door",
  desk: "At the front desk",
  noteboard: "At the settings board",
  corridor: "In the corridor",
  room: "In the interview room",
};

/** Lined up with the corridor: the turn between desk and corridor. */
const CORRIDOR_MOUTH: Pose = {
  position: [CORRIDOR.x, 1.6, LOBBY.back + 1.6],
  target: [CORRIDOR.x, 1.5, ROOM.front],
  fov: 48,
};

/** Past the right-hand end of the front desk: the way round it to the board. */
const DESK_END: Pose = {
  position: [3.0, 1.65, DESK.z + 1.2],
  target: [(NOTEBOARD.left + NOTEBOARD.right) / 2, (NOTEBOARD.bottom + NOTEBOARD.top) / 2, NOTEBOARD.z],
  fov: 40,
};

/** A close-up of each note, for screens too small to use them from the board pose. */
export const NOTE_CLOSE_UPS: Record<BoardNote, Pose> = Object.fromEntries(
  (Object.keys(BOARD_NOTES) as BoardNote[]).map((name) => {
    const n = BOARD_NOTES[name];
    // Aimed a little low: the writing is under the note's title.
    const y = n.y - 0.06;
    return [name, { position: [n.x, y, NOTEBOARD.z + 1.35], target: [n.x, y, NOTEBOARD.z], fov: 40, fit: n.w / 2 + 0.04 } satisfies Pose];
  }),
) as Record<BoardNote, Pose>;

/** Waypoints between stations. Stops the camera cutting through walls. */
const WAYPOINTS: Partial<Record<`${Station}>${Station}`, Pose[]>> = {
  "street>desk": [POSES.entrance],
  "entrance>room": [POSES.desk, CORRIDOR_MOUTH, POSES.corridor],
  "street>room": [POSES.entrance, POSES.desk, CORRIDOR_MOUTH, POSES.corridor],
  "desk>room": [CORRIDOR_MOUTH, POSES.corridor],
  "desk>corridor": [CORRIDOR_MOUTH],
  // Round the end of the counter, never over it.
  "desk>noteboard": [DESK_END],
  "noteboard>entrance": [DESK_END, POSES.desk],
  "noteboard>street": [DESK_END, POSES.desk, POSES.entrance],
  "noteboard>room": [DESK_END, POSES.desk, CORRIDOR_MOUTH, POSES.corridor],
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

const STATIONS: readonly Station[] = ["street", "entrance", "desk", "noteboard", "corridor", "room"];

/** Which station a route belongs to. Unknown routes stand at the desk. */
export function stationForPath(pathname: string): Station {
  // Dev only: /dev/building/<station> (404 in production).
  const dev = /^\/dev\/building\/([a-z]+)$/.exec(pathname)?.[1];
  if (dev && (STATIONS as readonly string[]).includes(dev)) return dev as Station;
  if (pathname === "/") return "street";
  if (pathname.startsWith("/login")) return "entrance";
  if (pathname.startsWith("/settings")) return "noteboard";
  if (/^\/interview\/[^/]+$/.test(pathname) && pathname !== "/interview/new") return "room";
  return "desk";
}

/** Narrow screens widen the vertical fov to keep the landscape width in view. */
export function fovFor(pose: Pose, aspect: number): number {
  const minAspect = 1.3;
  if (aspect >= minAspect) return pose.fov;
  const half = (pose.fov * Math.PI) / 360;
  const widened = (2 * Math.atan((Math.tan(half) * minAspect) / aspect) * 180) / Math.PI;
  return Math.min(widened, 80);
}
