import { describe, expect, it } from "vitest";

import { pickTagline } from "./useTagline";

describe("pickTagline", () => {
  it("never repeats the last one", () => {
    for (let last = 0; last < 3; last++) {
      for (const r of [0, 0.34, 0.5, 0.67, 0.99]) {
        expect(pickTagline(3, last, () => r)).not.toBe(last);
      }
    }
  });

  it("can pick every other one", () => {
    const picks = new Set([0, 0.6].map((r) => pickTagline(3, 1, () => r)));
    expect(picks).toEqual(new Set([0, 2]));
  });

  it("picks from all of them with nothing remembered, or something out of range", () => {
    expect(pickTagline(3, null, () => 0.99)).toBe(2);
    expect(pickTagline(3, 7, () => 0)).toBe(0);
  });
});
