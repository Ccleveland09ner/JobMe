import { describe, expect, it } from "vitest";

import {
  alignedTimeline,
  estimatedTimeline,
  openness,
  sampleVisemes,
  wordAt,
  wordAtChar,
  wordVisemes,
} from "./lipsync";

const shapes = (word: string) => wordVisemes(word).map((v) => v.viseme);

describe("wordVisemes", () => {
  it("closes the lips on p, b and m", () => {
    expect(shapes("mob")).toEqual(["PP", "O", "PP"]);
  });

  it("reads common digraphs as one shape", () => {
    expect(shapes("think")).toEqual(["TH", "I", "nn", "kk"]);
    expect(shapes("phone")).toEqual(["FF", "O", "nn"]);
    expect(shapes("watch")).toEqual(["U", "aa", "CH"]);
  });

  it("holds doubled letters as one shape", () => {
    expect(shapes("tell")).toEqual(["DD", "E", "nn"]);
  });

  it("drops a silent final e but keeps its letter span", () => {
    const v = wordVisemes("make");
    expect(v.map((x) => x.viseme)).toEqual(["PP", "aa", "kk"]);
    expect(v.at(-1)!.to).toBe(4);
  });

  it("softens c before e, i and y", () => {
    expect(shapes("cat")[0]).toBe("kk");
    expect(shapes("city")[0]).toBe("SS");
  });

  it("gives every letter a home, so spans are contiguous", () => {
    for (const word of ["through", "question", "experience", "what's", "team"]) {
      const v = wordVisemes(word);
      expect(v[0].from).toBe(0);
      expect(v.at(-1)!.to).toBe(word.length);
      for (let i = 1; i < v.length; i++) expect(v[i].from).toBeLessThanOrEqual(v[i - 1].to);
    }
  });
});

describe("estimatedTimeline", () => {
  const text = "Tell me about a time.";
  const tl = estimatedTimeline(text, 14);

  it("lists every word with its place in the text", () => {
    expect(tl.words.map((w) => text.slice(w.charStart, w.charEnd))).toEqual(["Tell", "me", "about", "a", "time"]);
  });

  it("keeps words and cues in time order", () => {
    for (let i = 1; i < tl.words.length; i++) expect(tl.words[i].start).toBeGreaterThanOrEqual(tl.words[i - 1].end);
    for (let i = 1; i < tl.cues.length; i++) expect(tl.cues[i].start).toBeGreaterThanOrEqual(tl.cues[i - 1].start);
  });

  it("speaks faster at a higher rate", () => {
    expect(estimatedTimeline(text, 20).duration).toBeLessThan(estimatedTimeline(text, 10).duration);
  });

  it("pauses longer after a sentence than between words", () => {
    const a = estimatedTimeline("one two", 14);
    const b = estimatedTimeline("one. two", 14);
    expect(b.words[1].start).toBeGreaterThan(a.words[1].start);
  });
});

describe("alignedTimeline", () => {
  it("uses the reported character times exactly", () => {
    const text = "Hi mom";
    const chars = [...text];
    const starts = chars.map((_, i) => i * 0.1);
    const ends = chars.map((_, i) => i * 0.1 + 0.1);
    const tl = alignedTimeline(text, chars, starts, ends);
    expect(tl.words.map((w) => [w.charStart, w.charEnd])).toEqual([
      [0, 2],
      [3, 6],
    ]);
    expect(tl.words[1].start).toBeCloseTo(0.3);
    expect(tl.words[1].end).toBeCloseTo(0.6);
    // "mom": m (closed) at 0.3-0.4, o, m (closed) at 0.5-0.6.
    expect(tl.cues.filter((c) => c.start >= 0.3).map((c) => c.viseme)).toEqual(["PP", "O", "PP"]);
  });

  it("falls back to an estimate when the characters do not spell the text", () => {
    const tl = alignedTimeline("Hello there", ["H", "i"], [0, 0.1], [0.1, 0.2]);
    expect(tl.words).toHaveLength(2);
  });
});

describe("sampleVisemes", () => {
  const tl = alignedTimeline("ma", ["m", "a"], [0, 0.2], [0.2, 0.4]);

  it("is silent before speech", () => {
    expect(sampleVisemes(tl, -1)).toEqual({});
  });

  it("closes the lips during the m", () => {
    expect(sampleVisemes(tl, 0.1).PP).toBeCloseTo(1);
  });

  it("opens the jaw during the a", () => {
    const w = sampleVisemes(tl, 0.3);
    expect(w.aa).toBeGreaterThan(0.5);
    expect(openness(w)).toBeGreaterThan(0.5);
  });

  it("blends neighbouring shapes at the boundary", () => {
    const w = sampleVisemes(tl, 0.2);
    expect(w.PP).toBeGreaterThan(0);
    expect(w.aa).toBeGreaterThan(0);
  });
});

describe("word lookup", () => {
  const text = "Tell me more";
  const tl = estimatedTimeline(text, 14);

  it("finds the word being spoken", () => {
    expect(wordAt(tl, tl.words[1].start + 0.01)).toBe(1);
  });

  it("maps a boundary character to its word", () => {
    expect(wordAtChar(tl, text.indexOf("more"))).toBe(2);
    // A boundary reported on the space before a word belongs to that word.
    expect(wordAtChar(tl, text.indexOf(" more"))).toBe(2);
  });
});
