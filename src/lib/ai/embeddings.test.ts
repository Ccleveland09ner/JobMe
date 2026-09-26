import { describe, expect, it } from "vitest";

import { EmbeddingError, cosine, rankBySimilarity, simToScore } from "./embeddings";

describe("cosine", () => {
  it("is 1 for identical vectors", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("is -1 for opposed vectors", () => {
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("ignores magnitude", () => {
    expect(cosine([1, 1], [5, 5])).toBeCloseTo(1);
  });

  it("returns 0 rather than NaN for a zero vector", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });

  /**
   * Comparing vectors embedded at different `outputDimensionality` is a real
   * hazard once the bank is re-embedded: it would otherwise read a garbage
   * similarity and silently mis-score answers.
   */
  it("throws on a dimension mismatch instead of guessing", () => {
    expect(() => cosine([1, 2], [1, 2, 3])).toThrow(EmbeddingError);
  });
});

describe("rankBySimilarity", () => {
  const candidates = [
    { item: "orthogonal", vector: [0, 1] },
    { item: "identical", vector: [1, 0] },
    { item: "similar", vector: [0.9, 0.1] },
  ];

  it("orders by similarity, most similar first", () => {
    const ranked = rankBySimilarity([1, 0], candidates);
    expect(ranked.map((r) => r.item)).toEqual([
      "identical",
      "similar",
      "orthogonal",
    ]);
  });

  it("respects topK", () => {
    expect(rankBySimilarity([1, 0], candidates, 2)).toHaveLength(2);
  });

  it("handles an empty candidate list", () => {
    expect(rankBySimilarity([1, 0], [])).toEqual([]);
  });
});

describe("simToScore", () => {
  it("maps similarity onto the 1-4 rubric scale", () => {
    expect(simToScore(0.1)).toBe(1);
    expect(simToScore(0.6)).toBe(2);
    expect(simToScore(0.7)).toBe(3);
    expect(simToScore(0.9)).toBe(4);
  });

  it("stays inside the rubric's range at the extremes", () => {
    for (const sim of [-1, 0, 0.5, 1]) {
      expect(simToScore(sim)).toBeGreaterThanOrEqual(1);
      expect(simToScore(sim)).toBeLessThanOrEqual(4);
    }
  });
});
