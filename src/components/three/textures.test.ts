import { describe, expect, it } from "vitest";

import { detailPixels, type DetailTexture } from "./textures";

const NAMES = [
  "plaster",
  "planks",
  "grain",
  "stone",
  "pavers",
  "grass",
  "cork",
  "paper",
  "pages",
  "leather",
  "weave",
  "hardboard",
] satisfies DetailTexture[];

describe("detail textures", () => {
  it.each(NAMES)("%s stays near white, so the palette colour it multiplies stays recognisable", (name) => {
    const { values } = detailPixels(name);
    let sum = 0;
    let min = 1;
    for (const v of values) {
      sum += v;
      min = Math.min(min, v);
    }
    const mean = sum / values.length;
    expect(mean).toBeGreaterThan(0.82);
    expect(mean).toBeLessThan(1);
    // Seams and pits are the darkest, and still let the colour through.
    expect(min).toBeGreaterThan(0.3);
  });

  it("draws the same pixels every time", () => {
    expect(detailPixels("cork").values).toEqual(detailPixels("cork").values);
  });
});
