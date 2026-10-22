import { describe, expect, it } from "vitest";

import { clampPage, pageCount, rowRange } from "./pagination";

describe("pageCount", () => {
  it("is at least 1, even with no items", () => {
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(-3, 10)).toBe(1);
  });

  it("rounds up partial pages", () => {
    expect(pageCount(10, 10)).toBe(1);
    expect(pageCount(11, 10)).toBe(2);
  });
});

describe("clampPage", () => {
  it("parses query-string pages", () => {
    expect(clampPage("3", 5)).toBe(3);
  });

  it("falls back to 1 on garbage", () => {
    expect(clampPage("abc", 5)).toBe(1);
    expect(clampPage(undefined, 5)).toBe(1);
  });

  it("clamps out-of-range pages, e.g. after deleting the last row of the last page", () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(9, 5)).toBe(5);
  });
});

describe("rowRange", () => {
  it("is inclusive and zero-based", () => {
    expect(rowRange(1, 10)).toEqual([0, 9]);
    expect(rowRange(3, 10)).toEqual([20, 29]);
  });
});
