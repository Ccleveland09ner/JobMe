import { describe, expect, it } from "vitest";

import { timeOfDayAt, timeOfDayFor } from "./timeOfDay";

describe("timeOfDayAt", () => {
  it("is day from 06:00 to 16:59", () => {
    expect(timeOfDayAt(6)).toBe("day");
    expect(timeOfDayAt(16)).toBe("day");
  });

  it("is dusk from 17:00 to 19:59", () => {
    expect(timeOfDayAt(17)).toBe("dusk");
    expect(timeOfDayAt(19)).toBe("dusk");
  });

  it("is night from 20:00 to 05:59", () => {
    expect(timeOfDayAt(20)).toBe("night");
    expect(timeOfDayAt(0)).toBe("night");
    expect(timeOfDayAt(5)).toBe("night");
  });
});

describe("timeOfDayFor", () => {
  it("lets ?time= override the clock", () => {
    expect(timeOfDayFor(12, "?time=night")).toBe("night");
    expect(timeOfDayFor(2, "?time=day")).toBe("day");
    expect(timeOfDayFor(12, "?foo=1&time=dusk")).toBe("dusk");
  });

  it("ignores anything else", () => {
    expect(timeOfDayFor(12, "?time=noon")).toBe("day");
    expect(timeOfDayFor(21, "")).toBe("night");
  });
});
