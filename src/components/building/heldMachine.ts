/**
 * What the user is holding: the ledger, the reports folder or the clipboard
 * from the front desk, or the notepad in the interview room. A pure reducer (heldMachine.test.ts), like
 * buildingMachine.ts and room/roomMachine.ts.
 *
 *   resting ─REQUEST(x)─▶ lifting ─LIFTED─▶ open ─REQUEST(≠x)─▶ closing
 *      ▲                  (3D object         (DOM object          (DOM object
 *      │                   comes to you)      in your hands)       shuts)
 *      │                                                              │
 *      └──────────── RETURNED ◀── returning ◀────── DOM_CLOSED ───────┘
 *                               (3D object goes back to where it rests)
 *
 * One object at a time, one motion at a time. A request that arrives while
 * something is moving is queued — the latest wins — and applied when the
 * motion ends. That queue is the ledger → folder handoff: asking for the
 * folder while the ledger is open closes the ledger, puts it down, then picks
 * up the folder, as one continuous sequence.
 *
 * Who sends what:
 *   REQUEST     the page (from the URL), or the room (its notepad button)
 *   LIFTED      the 3D object, when it reaches the camera (or at once when
 *               there is no 3D — see BuildingProvider)
 *   DOM_CLOSED  the held DOM object, when its closing animation ends
 *   RETURNED    the 3D object, when it is back where it rests
 */

export type Held = "ledger" | "reports" | "clipboard" | "notepad";
export type HeldPhase = "resting" | "lifting" | "open" | "closing" | "returning";

export interface HeldState {
  held: Held | null;
  phase: HeldPhase;
  /**
   * What to hold once the current motion ends: an object, null for "nothing",
   * or undefined when nothing is queued.
   */
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
