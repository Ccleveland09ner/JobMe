import { describe, expect, it } from "vitest";

import { clampPage, pageCount, pageWindow, rowRange } from "./pagination";

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

describe("pageWindow", () => {
  it("lists every page when there are few", () => {
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps a constant slot count as the current page moves", () => {
    const lengths = Array.from({ length: 20 }, (_, i) => pageWindow(i + 1, 20).length);
    expect(new Set(lengths)).toEqual(new Set([7]));
  });

  it("always shows first, last and the current page", () => {
    for (let page = 1; page <= 20; page++) {
      const slots = pageWindow(page, 20);
      expect(slots[0]).toBe(1);
      expect(slots.at(-1)).toBe(20);
      expect(slots).toContain(page);
    }
  });

  it("marks skipped ranges with gaps", () => {
    expect(pageWindow(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
  });
});
