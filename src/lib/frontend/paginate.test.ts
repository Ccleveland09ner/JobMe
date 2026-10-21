import { describe, expect, it } from "vitest";

import { isLeftPage } from "./book-layout";
import { oversized, packPages, splitText, type FlowBlock, type PagePlan } from "./paginate";

const block = (id: string, height: number, extra: Partial<FlowBlock> = {}): FlowBlock => ({ id, height, ...extra });
const ids = (pages: PagePlan[]) => pages.map((p) => (p.kind === "blank" ? "·" : p.ids.join(",")));

describe("packPages", () => {
  it("fills each page in order without going past its height", () => {
    const blocks = [block("a", 200), block("b", 200), block("c", 200), block("d", 50)];
    expect(ids(packPages(blocks, { capacity: 450, gap: 10 }))).toEqual(["a,b", "c,d"]);
  });

  it("starts a new page before a break", () => {
    const blocks = [block("a", 50), block("b", 50, { breakBefore: true })];
    expect(ids(packPages(blocks, { capacity: 450, gap: 10 }))).toEqual(["a", "b"]);
  });

  it("carries a heading over with the entry it introduces", () => {
    const blocks = [block("a", 300), block("h", 40, { keepWithNext: true }), block("x", 120)];
    expect(ids(packPages(blocks, { capacity: 450, gap: 10 }))).toEqual(["a", "h,x"]);
  });

  it("lands a section on a left-hand page, filling the gap with a blank", () => {
    const covers = (i: number) => isLeftPage(i, true);
    // First packed page is document page 5 (left, after a cover).
    const blocks = [block("one", 400, { startOnLeft: true }), block("two", 400, { startOnLeft: true })];
    const pages = packPages(blocks, { capacity: 450, gap: 10, firstPage: 5, isLeft: covers });
    expect(ids(pages)).toEqual(["one", "·", "two"]);
    expect(covers(5 + 2)).toBe(true);
  });

  it("gives a block taller than a page a page of its own, and reports it", () => {
    const blocks = [block("a", 50), block("big", 600), block("b", 50)];
    expect(ids(packPages(blocks, { capacity: 450, gap: 10 }))).toEqual(["a", "big", "b"]);
    expect(oversized(blocks, 450)).toEqual(["big"]);
  });
});

describe("splitText", () => {
  const text = "First sentence here. Second one is a bit longer than that! Third? Fourth and final sentence.";

  it("keeps every piece within the limit and loses no words", () => {
    const pieces = splitText(text, 40);
    expect(pieces.every((p) => p.length <= 40)).toBe(true);
    expect(pieces.join(" ").split(/\s+/)).toEqual(text.split(/\s+/));
  });

  it("breaks at sentence ends where it can", () => {
    // The first two sentences together run to 59 characters.
    expect(splitText(text, 45)[0]).toBe("First sentence here.");
    expect(splitText(text, 60)[0]).toBe("First sentence here. Second one is a bit longer than that!");
  });

  it("breaks a single over-long sentence between words", () => {
    const long = "word ".repeat(30).trim();
    const pieces = splitText(long, 25);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((p) => p.length <= 25)).toBe(true);
  });
});
