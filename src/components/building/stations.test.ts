import { describe, expect, it } from "vitest";

import { fovFor, NOTE_CLOSE_UPS, pathBetween, POSES, stationForPath } from "./stations";
import { BOARD_NOTES, DESK, NOTEBOARD, type BoardNote } from "./world";

describe("stationForPath", () => {
  it("puts settings at the notice board", () => {
    expect(stationForPath("/settings")).toBe("noteboard");
  });

  it("keeps the desk's objects at the desk", () => {
    expect(stationForPath("/dashboard")).toBe("desk");
    expect(stationForPath("/interview/new")).toBe("desk");
    expect(stationForPath("/reports")).toBe("desk");
  });

  it("sends an interview to the room", () => {
    expect(stationForPath("/interview/abc")).toBe("room");
  });
});

describe("pathBetween", () => {
  it("walks round the end of the counter to the board, and back the same way", () => {
    const there = pathBetween("desk", "noteboard");
    expect(there).toHaveLength(2);
    expect(there.at(-1)).toBe(POSES.noteboard);
    const back = pathBetween("noteboard", "desk");
    expect(back).toEqual([there[0], POSES.desk]);
  });

  it("never walks over the counter: the way round is past its end", () => {
    const [round] = pathBetween("desk", "noteboard");
    expect(round.position[0]).toBeGreaterThan(DESK.width / 2);
  });

  it("goes past the desk from the board to anywhere further", () => {
    const out = pathBetween("noteboard", "entrance");
    expect(out).toEqual([pathBetween("desk", "noteboard")[0], POSES.desk, POSES.entrance]);
  });
});

describe("the notice board poses", () => {
  /** Half the view's height and width at `distance`, at the narrowest landscape fovFor keeps. */
  const halfView = (fov: number, distance: number) => {
    const half = distance * Math.tan((fovFor({ position: [0, 0, 0], target: [0, 0, 0], fov }, 1.3) * Math.PI) / 360);
    return { h: half, w: half * 1.3 };
  };

  it("faces the board square on, with both notes whole in view", () => {
    const { position, target, fov } = POSES.noteboard;
    expect([position[0], position[1]]).toEqual([target[0], target[1]]);
    const view = halfView(fov, position[2] - NOTEBOARD.z);
    for (const n of Object.values(BOARD_NOTES)) {
      expect(Math.abs(n.x - position[0]) + n.w / 2).toBeLessThan(view.w);
      expect(Math.abs(n.y - position[1]) + n.h / 2).toBeLessThan(view.h);
    }
  });

  it("keeps the whole board in view on any screen, stepping back if it must", () => {
    expect(POSES.noteboard.fit).toBeGreaterThan((NOTEBOARD.right - NOTEBOARD.left) / 2);
    for (const name of Object.keys(BOARD_NOTES) as BoardNote[]) {
      expect(NOTE_CLOSE_UPS[name].fit).toBeGreaterThan(BOARD_NOTES[name].w / 2);
    }
  });

  it("has a close-up square on to each note, nearer than the board view", () => {
    for (const name of Object.keys(BOARD_NOTES) as BoardNote[]) {
      const n = BOARD_NOTES[name];
      const { position, target, fov } = NOTE_CLOSE_UPS[name];
      expect(position[0]).toBe(n.x);
      expect([position[0], position[1]]).toEqual([target[0], target[1]]);
      expect(position[2]).toBeLessThan(POSES.noteboard.position[2]);
      // The whole width of the note stays in view.
      expect(n.w / 2).toBeLessThan(halfView(fov, position[2] - NOTEBOARD.z).w);
    }
  });
});
