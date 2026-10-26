import { describe, expect, it } from "vitest";

import { streetSoundAt, streetSoundFor } from "./sounds";

describe("streetSoundAt", () => {
  it("plays dusk sounds at sunrise and at sunset", () => {
    expect([5, 6].map(streetSoundAt)).toEqual(["dusk", "dusk"]);
    expect([17, 18, 19].map(streetSoundAt)).toEqual(["dusk", "dusk", "dusk"]);
  });

  it("plays day sounds through the day and evening sounds through the night", () => {
    expect([7, 12, 16].map(streetSoundAt)).toEqual(["day", "day", "day"]);
    expect([20, 23, 0, 4].map(streetSoundAt)).toEqual(["evening", "evening", "evening", "evening"]);
  });
});

describe("streetSoundFor", () => {
  it("follows the clock while the sky shows the clock's time", () => {
    expect(streetSoundFor("day", "day", 6)).toBe("dusk");
    expect(streetSoundFor("night", "night", 22)).toBe("evening");
  });

  it("sounds as the sky looks when it is shown at another time", () => {
    expect(streetSoundFor("night", "day", 12)).toBe("evening");
    expect(streetSoundFor("dusk", "night", 2)).toBe("dusk");
    expect(streetSoundFor("day", "dusk", 18)).toBe("day");
  });
});
