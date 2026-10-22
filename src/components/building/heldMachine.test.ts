import { describe, expect, it } from "vitest";

import { domVisible, heldReducer, initialHeld, type HeldEvent, type HeldState } from "./heldMachine";

const run = (state: HeldState, ...events: HeldEvent[]) => events.reduce(heldReducer, state);
const request = (want: HeldState["held"]): HeldEvent => ({ type: "REQUEST", want });
const LIFTED: HeldEvent = { type: "LIFTED" };
const DOM_CLOSED: HeldEvent = { type: "DOM_CLOSED" };
const RETURNED: HeldEvent = { type: "RETURNED" };

describe("heldReducer", () => {
  it("picks up, opens, closes and puts down", () => {
    const lifting = run(initialHeld(), request("ledger"));
    expect(lifting).toMatchObject({ held: "ledger", phase: "lifting" });
    const open = run(lifting, LIFTED);
    expect(open.phase).toBe("open");
    expect(domVisible(open)).toBe(true);
    const closing = run(open, request(null));
    expect(closing.phase).toBe("closing");
    expect(domVisible(closing)).toBe(true);
    const returning = run(closing, DOM_CLOSED);
    expect(returning.phase).toBe("returning");
    expect(domVisible(returning)).toBe(false);
    expect(run(returning, RETURNED)).toEqual(initialHeld());
  });

  it("hands the ledger over to the folder as one sequence", () => {
    const open = run(initialHeld(), request("ledger"), LIFTED);
    const closing = run(open, request("reports"));
    expect(closing).toMatchObject({ held: "ledger", phase: "closing", queued: "reports" });
    const next = run(closing, DOM_CLOSED, RETURNED);
    expect(next).toMatchObject({ held: "reports", phase: "lifting", queued: undefined });
    expect(run(next, LIFTED)).toMatchObject({ held: "reports", phase: "open" });
  });

  it("puts the ledger down before picking up the clipboard", () => {
    const closing = run(initialHeld(), request("ledger"), LIFTED, request("clipboard"));
    expect(closing).toMatchObject({ held: "ledger", phase: "closing", queued: "clipboard" });
    expect(run(closing, DOM_CLOSED, RETURNED, LIFTED)).toMatchObject({ held: "clipboard", phase: "open" });
  });

  it("ignores asking for what is already open", () => {
    const open = run(initialHeld(), request("reports"), LIFTED);
    expect(run(open, request("reports"))).toBe(open);
  });

  it("ignores closing when nothing is held", () => {
    const s = initialHeld();
    expect(run(s, request(null))).toBe(s);
  });

  it("queues requests made mid-motion, latest wins", () => {
    const lifting = run(initialHeld(), request("ledger"), request("reports"), request("notepad"));
    expect(lifting).toMatchObject({ held: "ledger", phase: "lifting", queued: "notepad" });
    // On arrival it opens and immediately starts closing toward the queued one.
    const after = run(lifting, LIFTED);
    expect(after).toMatchObject({ phase: "closing", queued: "notepad" });
    expect(run(after, DOM_CLOSED, RETURNED)).toMatchObject({ held: "notepad", phase: "lifting" });
  });

  it("cancels a queued request when the original is asked for again", () => {
    const lifting = run(initialHeld(), request("ledger"), request("reports"), request("ledger"));
    expect(lifting.queued).toBeUndefined();
    expect(run(lifting, LIFTED).phase).toBe("open");
  });

  it("lets a request during closing replace the destination", () => {
    const closing = run(initialHeld(), request("ledger"), LIFTED, request("reports"), request(null));
    expect(closing.queued).toBeNull();
    expect(run(closing, DOM_CLOSED, RETURNED)).toEqual(initialHeld());
  });

  it("drops out-of-order signals", () => {
    const s = initialHeld();
    expect(run(s, LIFTED)).toBe(s);
    expect(run(s, DOM_CLOSED)).toBe(s);
    expect(run(s, RETURNED)).toBe(s);
    const open = run(s, request("ledger"), LIFTED);
    expect(run(open, LIFTED)).toBe(open);
    expect(run(open, RETURNED)).toBe(open);
  });
});
