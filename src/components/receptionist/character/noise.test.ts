import { describe, expect, it } from "vitest";

import { fractal, gradientNoise, seededRandom } from "./noise";

describe("seededRandom", () => {
  it("repeats for the same seed and stays in [0, 1)", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    for (let i = 0; i < 200; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("gradientNoise", () => {
  it("grows the same hair from the same seed", () => {
    const a = gradientNoise(42);
    const b = gradientNoise(42);
    expect(a(0.3, 1.7, -2.2)).toBe(b(0.3, 1.7, -2.2));
    expect(gradientNoise(43)(0.3, 1.7, -2.2)).not.toBe(a(0.3, 1.7, -2.2));
  });

  it("is zero at whole points, bounded and smooth between them", () => {
    const n = gradientNoise(1);
    expect(n(2, 3, 4)).toBe(0);
    let previous = n(0.5, 0.5, 0.5);
    for (let x = 0.5; x < 4; x += 0.01) {
      const v = n(x, 0.5, 0.5);
      expect(Math.abs(v)).toBeLessThanOrEqual(1.01);
      expect(Math.abs(v - previous)).toBeLessThan(0.08);
      previous = v;
    }
  });

  it("sums octaves into about the same range", () => {
    const n = gradientNoise(5);
    for (let i = 0; i < 100; i++) expect(Math.abs(fractal(n, i * 0.37, i * 0.11, 1.3, 3))).toBeLessThanOrEqual(1.01);
  });
});
