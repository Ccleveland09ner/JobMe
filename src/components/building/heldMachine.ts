/**
 * What the user is holding: a desk object or the room's notepad. One object
 * and one motion at a time; a request made mid-motion is queued (latest wins).
 *
 *   resting → lifting → open → closing → returning → resting
 */

export type Held = "ledger" | "reports" | "clipboard" | "notepad";
export type HeldPhase = "resting" | "lifting" | "open" | "closing" | "returning";

export interface HeldState {
  held: Held | null;
  phase: HeldPhase;
  /** Held next once the motion ends: an object, null for nothing, undefined if none queued. */
  queued: Held | null | undefined;
}

export type HeldEvent =
  | { type: "REQUEST"; want: Held | null }
  | { type: "LIFTED" }
  | { type: "DOM_CLOSED" }
  | { type: "RETURNED" };

export function initialHeld(): HeldState {
  return { held: null, phase: "resting", queued: undefined };
}

/** Start putting the current object down, remembering what comes next. */
function close(state: HeldState, next: Held | null): HeldState {
  return { ...state, phase: "closing", queued: next === null ? undefined : next };
}

export function heldReducer(state: HeldState, event: HeldEvent): HeldState {
  switch (event.type) {
    case "REQUEST": {
      const { want } = event;
      switch (state.phase) {
        case "resting":
          return want === null ? state : { held: want, phase: "lifting", queued: undefined };
        case "open":
          return want === state.held ? state : close(state, want);
        // Moving: remember the latest wish, act on it when the motion ends.
        case "lifting":
          return { ...state, queued: want === state.held ? undefined : want };
        case "closing":
        case "returning":
          return { ...state, queued: want };
      }
      return state;
    }

    case "LIFTED": {
      if (state.phase !== "lifting") return state;
      const opened: HeldState = { ...state, phase: "open", queued: undefined };
      // Asked for something else on the way up: open, then close straight away.
      return state.queued === undefined ? opened : close(opened, state.queued);
    }

    case "DOM_CLOSED":
      return state.phase === "closing" ? { ...state, phase: "returning" } : state;

    case "RETURNED": {
      if (state.phase !== "returning") return state;
      const next = state.queued;
      if (next) return { held: next, phase: "lifting", queued: undefined };
      return initialHeld();
    }
  }
}

/** True while the DOM object should be on screen (open, or closing). */
export function domVisible(state: HeldState): boolean {
  return state.phase === "open" || state.phase === "closing";
}
