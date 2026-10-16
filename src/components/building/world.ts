/**
 * The building's floor plan, in metres. Every scene file and every camera
 * pose reads from here, so moving a wall moves everything that depends on it.
 *
 *            +Z  (street)
 *   ───────────────────────────  z = FACADE_Z, front doors at x = 0
 *   │            LOBBY        │
 *   │     [ front desk ]      │  secretary behind it, facing the doors
 *   │                         │
 *   └──┬──┬───────────────────┘  z = LOBBY.back
 *      │C │  corridor, x = CORRIDOR.x
 *   ┌──┴──┴────┐                 z = ROOM.front, room door
 *   │  ROOM    │  table; recruiter on the far side, facing the door
 *   └──────────┘                 z = ROOM.back
 *            −Z
 */

export const FACADE_Z = 0;

export const DOOR = { width: 2.2, height: 2.7 } as const;

export const LOBBY = {
  left: -6,
  right: 6,
  front: FACADE_Z,
  back: -10,
  height: 3.6,
} as const;

/** The front desk's front edge, and where the secretary sits behind it. */
export const DESK = { z: -6, width: 3.4, depth: 0.7, height: 0.78 } as const;
export const SECRETARY = { x: 0, z: -7.05 } as const;

export const CORRIDOR = { x: -4.2, width: 1.8, front: LOBBY.back, back: -17, height: 2.8 } as const;

export const ROOM = {
  left: -7.6,
  right: -0.8,
  front: CORRIDOR.back,
  back: -23.5,
  height: 3,
} as const;

/** The interview table, the recruiter's seat behind it, and the candidate's in front. */
export const TABLE = { x: CORRIDOR.x, z: -21, width: 2.4, depth: 1.1, height: 0.76 } as const;
export const RECRUITER = { x: CORRIDOR.x, z: -22.25 } as const;
export const CANDIDATE = { x: CORRIDOR.x, z: -18.7 } as const;
