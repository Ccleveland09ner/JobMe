import { describe, expect, it } from "vitest";

import { buildingReducer, initialBuilding, type BuildingEvent, type BuildingState } from "./buildingMachine";
import { fovFor, pathBetween, POSES, stationForPath } from "./stations";

const run = (state: BuildingState, ...events: BuildingEvent[]) => events.reduce(buildingReducer, state);

describe("buildingReducer", () => {
  it("walks to a station and settles there on arrival", () => {
    const walking = run(initialBuilding("entrance"), { type: "WALK", to: "desk", hold: false });
    expect(walking).toMatchObject({ station: "entrance", target: "desk", holding: false, walkId: 1 });
    expect(run(walking, { type: "ARRIVE" })).toMatchObject({ station: "desk", target: null });
  });

  it("allows one walk at a time", () => {
    const walking = run(initialBuilding("desk"), { type: "WALK", to: "room", hold: true });
    expect(run(walking, { type: "WALK", to: "entrance", hold: false })).toBe(walking);
  });

  it("ignores a walk to where the user already is", () => {
    const s = initialBuilding("desk");
    expect(run(s, { type: "WALK", to: "desk", hold: false })).toBe(s);
  });

  it("holds at the waypoint until released, then arrives", () => {
    const held = run(initialBuilding("desk"), { type: "WALK", to: "room", hold: true }, { type: "ARRIVE" });
    expect(held).toMatchObject({ station: "desk", target: "room", holding: true });
    const released = run(held, { type: "RELEASE" });
    expect(released.holding).toBe(false);
    expect(run(released, { type: "ARRIVE" })).toMatchObject({ station: "room", target: null });
  });

  it("walks back where it began when the walk fails, keeping the message", () => {
    const failed = run(initialBuilding("desk"), { type: "WALK", to: "room", hold: true }, { type: "FAIL", message: "Busy" });
    expect(failed).toMatchObject({ station: "desk", target: "desk", returning: true, holding: false, failure: "Busy", walkId: 2 });
    expect(run(failed, { type: "ARRIVE" })).toMatchObject({ station: "desk", target: null, returning: false, failure: "Busy" });
  });

  it("clears the failure on the next walk or when dismissed", () => {
    const settled = run(
      initialBuilding("desk"),
      { type: "WALK", to: "room", hold: true },
      { type: "FAIL", message: "Busy" },
      { type: "ARRIVE" },
    );
    expect(run(settled, { type: "DISMISS_FAILURE" }).failure).toBeNull();
    expect(run(settled, { type: "WALK", to: "room", hold: true }).failure).toBeNull();
  });

  it("lets a walk's own route change through without teleporting", () => {
    const walking = run(initialBuilding("desk"), { type: "WALK", to: "room", hold: true }, { type: "RELEASE" });
    expect(run(walking, { type: "ROUTE", station: "room" })).toBe(walking);
  });

  it("teleports on an unrelated route change", () => {
    expect(run(initialBuilding("room"), { type: "ROUTE", station: "desk" })).toMatchObject({ station: "desk", target: null });
  });

  it("falls back to the illustrated building on context loss and back on restore", () => {
    const lost = run(initialBuilding("desk"), { type: "CONTEXT_LOST" });
    expect(lost.render).toBe("illustrated");
    expect(run(lost, { type: "CONTEXT_RESTORED" }).render).toBe("3d");
  });
});

describe("stations", () => {
  it("maps routes to stations", () => {
    expect(stationForPath("/")).toBe("street");
    expect(stationForPath("/login")).toBe("entrance");
    expect(stationForPath("/dashboard")).toBe("desk");
    expect(stationForPath("/interview/new")).toBe("desk");
    expect(stationForPath("/interview/abc-123")).toBe("room");
    expect(stationForPath("/interview/abc-123/report")).toBe("desk");
    // The development viewer stands anywhere; unknown names fall back to the desk.
    expect(stationForPath("/dev/building/room")).toBe("room");
    expect(stationForPath("/dev/building/street")).toBe("street");
    expect(stationForPath("/dev/building/attic")).toBe("desk");
  });

  it("goes through the corridor between the desk and the room, both ways", () => {
    const there = pathBetween("desk", "room");
    expect(there).toHaveLength(3);
    expect(there.slice(1)).toEqual([POSES.corridor, POSES.room]);
    const back = pathBetween("room", "desk");
    expect(back[0]).toEqual(POSES.corridor);
    expect(back.at(-1)).toEqual(POSES.desk);
    expect(pathBetween("entrance", "desk")).toEqual([POSES.desk]);
  });

  it("widens the field of view on portrait screens only", () => {
    expect(fovFor(POSES.desk, 16 / 9)).toBe(POSES.desk.fov);
    expect(fovFor(POSES.desk, 0.5)).toBeGreaterThan(POSES.desk.fov);
    expect(fovFor(POSES.desk, 0.2)).toBe(80);
  });
});
