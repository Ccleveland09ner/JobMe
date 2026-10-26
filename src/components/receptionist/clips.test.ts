import { describe, expect, it } from "vitest";

import timings from "./clips.json";
import { revealedChars, timelineFor } from "./clips";
import { LINES, spokenText } from "./lines";

describe("the recorded timings", () => {
  it("exist for every line, recorded from its current text (re-record after changing one: npm run gen:receptionist)", () => {
    const recorded = timings as Record<string, { text: string; starts: number[]; ends: number[]; duration: number }>;
    for (const line of LINES) {
      const t = recorded[line.id];
      expect(t, line.id).toBeDefined();
      expect(t.text).toBe(spokenText(line.text));
      expect(t.starts).toHaveLength(t.text.length);
      expect(t.ends).toHaveLength(t.text.length);
      expect(t.duration).toBeGreaterThan(2);
      expect(t.duration).toBeLessThan(10);
    }
  });

  it("time each line's own words, under the bubble's text", () => {
    for (const line of LINES) {
      const timeline = timelineFor(line);
      expect(timeline.text).toBe(line.text);
      const words = line.text.match(/[A-Za-z0-9']+/g) ?? [];
      expect(timeline.words).toHaveLength(words.length);
      for (let i = 1; i < timeline.words.length; i++) expect(timeline.words[i].start).toBeGreaterThanOrEqual(timeline.words[i - 1].start);
    }
  });
});

describe("revealedChars", () => {
  const line = LINES[0];
  const timeline = timelineFor(line);

  it("shows nothing before she starts and everything once she has finished", () => {
    expect(revealedChars(timeline, -1)).toBe(0);
    expect(revealedChars(timeline, timeline.duration + 0.1)).toBe(line.text.length);
  });

  it("only grows, a whole word (and its punctuation) at a time", () => {
    let shown = 0;
    for (let t = 0; t <= timeline.duration; t += 0.05) {
      const next = revealedChars(timeline, t);
      expect(next).toBeGreaterThanOrEqual(shown);
      shown = next;
      // Never stops inside a word.
      expect(/[A-Za-z0-9']/.test(line.text[next] ?? " ") && /[A-Za-z0-9']/.test(line.text[next - 1] ?? " ")).toBe(false);
    }
  });

  it("keeps pace with the voice: the first word shows as she says it", () => {
    const first = timeline.words[0];
    expect(revealedChars(timeline, first.start)).toBeGreaterThanOrEqual(first.charEnd);
  });
});
