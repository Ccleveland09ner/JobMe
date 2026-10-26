import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LINES, linesOf, pickLine, spokenText, type LineKind } from "./lines";

const KINDS: LineKind[] = ["new", "returning", "goodbye"];

describe("the receptionist's lines", () => {
  it("has four of each: first-visit greetings, returning greetings and goodbyes", () => {
    for (const kind of KINDS) expect(linesOf(kind)).toHaveLength(4);
    expect(new Set(LINES.map((l) => l.id)).size).toBe(12);
  });

  it("gives every line a recorded clip in public/", () => {
    for (const line of LINES) {
      expect(line.src).toMatch(/^\/audio\/receptionist\/(greetings|goodbyes)\/[a-z]+-\d\.mp3$/);
      expect(existsSync(join(process.cwd(), "public", line.src)), line.src).toBe(true);
    }
  });

  it("speaks the name as a word, keeping every character where the bubble has it", () => {
    for (const line of LINES) {
      const spoken = spokenText(line.text);
      expect(spoken).toHaveLength(line.text.length);
      expect(spoken).not.toContain("JOBME");
      expect(spoken.toLowerCase()).toBe(line.text.toLowerCase());
    }
  });
});

describe("pickLine", () => {
  it("never says the same line twice running", () => {
    for (const kind of KINDS) {
      for (const previous of linesOf(kind)) {
        for (let r = 0; r < 1; r += 0.05) {
          const line = pickLine(kind, previous.id, () => r);
          expect(line.kind).toBe(kind);
          expect(line.id).not.toBe(previous.id);
        }
      }
    }
  });

  it("can pick any of the others", () => {
    const seen = new Set<string>();
    for (let r = 0; r < 1; r += 0.01) seen.add(pickLine("returning", "returning-1", () => r).id);
    expect([...seen].sort()).toEqual(["returning-2", "returning-3", "returning-4"]);
  });

  it("picks from all four when nothing was said before, even at the very top of the range", () => {
    const seen = new Set<string>();
    for (const r of [0, 0.26, 0.51, 0.76, 0.999999]) seen.add(pickLine("goodbye", null, () => r).id);
    expect(seen.size).toBe(4);
  });
});
