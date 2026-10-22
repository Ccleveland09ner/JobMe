import { describe, expect, it } from "vitest";

import { fitBook, isLeftPage, spreadAt } from "./book-layout";

const page = { width: 420, height: 580 };

describe("fitBook", () => {
  it("lays a spread out when two pages fit, sized by the height", () => {
    const fit = fitBook({ availableWidth: 1200, availableHeight: 600, page, minPageWidth: 300, maxPageWidth: 560 });
    expect(fit.orientation).toBe("landscape");
    expect(fit.blockWidth).toBe(fit.pageWidth * 2);
    expect(fit.pageHeight).toBeLessThanOrEqual(600);
    expect(fit.scale).toBeCloseTo(fit.pageWidth / 420);
  });

  it("never grows a page past the maximum", () => {
    const fit = fitBook({ availableWidth: 3000, availableHeight: 2000, page, minPageWidth: 300, maxPageWidth: 560 });
    expect(fit.pageWidth).toBe(560);
  });

  it("shows one page at a time on a narrow screen, below the engine's portrait threshold", () => {
    const fit = fitBook({ availableWidth: 360, availableHeight: 700, page, minPageWidth: 300, maxPageWidth: 560 });
    expect(fit.orientation).toBe("portrait");
    expect(fit.blockWidth).toBe(fit.pageWidth);
    expect(fit.blockWidth).toBeLessThan(600);
    expect(fit.pageWidth).toBeLessThanOrEqual(360);
  });

  it("goes portrait when the height is too short for a spread", () => {
    const fit = fitBook({ availableWidth: 1400, availableHeight: 380, page, minPageWidth: 300, maxPageWidth: 560 });
    expect(fit.orientation).toBe("portrait");
    expect(fit.pageHeight).toBeLessThanOrEqual(380);
  });
});

describe("spreadAt", () => {
  it("shows covers alone and the pages between in pairs", () => {
    expect(spreadAt(0, 8, "landscape", true)).toEqual([0]);
    expect(spreadAt(3, 8, "landscape", true)).toEqual([3, 4]);
    expect(spreadAt(7, 8, "landscape", true)).toEqual([7]);
  });

  it("pairs from the first page without covers, and shows one page in portrait", () => {
    expect(spreadAt(2, 6, "landscape", false)).toEqual([2, 3]);
    expect(spreadAt(4, 6, "portrait", false)).toEqual([4]);
  });
});

describe("isLeftPage", () => {
  it("puts odd pages on the left after a cover, even pages without one", () => {
    expect([1, 2, 3].map((i) => isLeftPage(i, true))).toEqual([true, false, true]);
    expect([0, 1, 2].map((i) => isLeftPage(i, false))).toEqual([true, false, true]);
  });
});
