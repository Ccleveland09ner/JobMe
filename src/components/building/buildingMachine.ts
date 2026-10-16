/**
 * Where the user is in the building, and how they are getting somewhere.
 * A pure reducer, so every transition is unit-tested without a browser
 * (buildingMachine.test.ts) — the same approach as room/roomMachine.ts.
 *
 *   settled ──WALK──▶ walking ──ARRIVE──▶ settled
 *                        │
 *                        └──FAIL──▶ returning ──ARRIVE──▶ settled (where it began)
 *
 * A walk can HOLD at its last waypoint while a request is in flight: the walk
 * to the interview room is the wait for the session to be created. ARRIVE
 * from the camera means "reached the end of the path"; RELEASE from the page
 * means "the request is done, carry on".
 *
 * It sequences the BUILDING, never the interview: no score, band or turn is
 * known here, and none must ever be.
 */

import type { Station } from "./stations";

export type Render = "3d" | "illustrated";

export interface BuildingState {
  /** Where the camera is settled, or last settled. */
  station: Station;
  /** Where a walk is heading; null when settled. */
  target: Station | null;
  /** True while a walk is waiting on its caller before the last leg. */
  holding: boolean;
  /** The walk is going back to `station` after a failure. */
  returning: boolean;
  /** A user-facing, already-sanitised message from the last failed walk. */
  failure: string | null;
  render: Render;
  /** Bumped on every new walk, so the camera can tell walks apart. */
  walkId: number;
}

export type BuildingEvent =
  /** The route changed without a walk (reload, back button, link). */
  | { type: "ROUTE"; station: Station }
  | { type: "WALK"; to: Station; hold: boolean }
  /** The caller's request finished: a held walk may take its last leg. */
  | { type: "RELEASE" }
  /** The camera reached the end of its path. */
  | { type: "ARRIVE" }
  | { type: "FAIL"; message: string }
  | { type: "DISMISS_FAILURE" }
  | { type: "CONTEXT_LOST" }
  | { type: "CONTEXT_RESTORED" };

export function initialBuilding(station: Station, render: Render = "3d"): BuildingState {
  return { station, target: null, holding: false, returning: false, failure: null, render, walkId: 0 };
}

export function buildingReducer(state: BuildingState, event: BuildingEvent): BuildingState {
  switch (event.type) {
    case "ROUTE":
      // A route change that a walk is already heading to is that walk's
      // business; anything else teleports.
      if (state.target === event.station) return state;
      if (state.station === event.station && state.target === null) return state;
      return { ...state, station: event.station, target: null, holding: false, returning: false };

    case "WALK":
      if (state.target !== null) return state; // one walk at a time
      if (event.to === state.station) return state;
      return {
        ...state,
        target: event.to,
        holding: event.hold,
        returning: false,
        failure: null,
        walkId: state.walkId + 1,
      };

    case "RELEASE":
      return state.holding ? { ...state, holding: false } : state;

    case "ARRIVE":
      if (state.target === null) return state;
      if (state.holding) return state; // the camera waits at the waypoint
      if (state.returning) return { ...state, target: null, returning: false };
      return { ...state, station: state.target, target: null };

    case "FAIL":
      if (state.target === null) return { ...state, failure: event.message };
      // Walk back to where this walk began; `station` still holds it.
      return {
        ...state,
        target: state.station,
        holding: false,
        returning: true,
        failure: event.message,
        walkId: state.walkId + 1,
      };

    case "DISMISS_FAILURE":
      return state.failure === null ? state : { ...state, failure: null };

    case "CONTEXT_LOST":
      return { ...state, render: "illustrated" };

    case "CONTEXT_RESTORED":
      return { ...state, render: "3d" };
  }
}
