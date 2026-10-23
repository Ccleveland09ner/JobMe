import { describe, expect, it } from "vitest";

import { checkDraft, checkOpening } from "../ai/questions";
import { BANK, clarifySeeds, deepenSeeds, questionFor } from "./bank";
import { DIMENSIONS, TOPIC_IDS, TOPIC_KINDS } from "./types";

describe("the bank's follow-ups", () => {
  // They stand in for a model draft whenever it is rejected or the model is
  // down, so they must pass the same check: one question, short, no placeholder.
  it("all pass the check a drafted follow-up must pass", () => {
    const rejected: string[] = [];
    for (const topic of TOPIC_IDS) {
      const seeds = [...deepenSeeds(topic), ...DIMENSIONS.flatMap((gap) => clarifySeeds(topic, gap))];
      for (const seed of seeds) {
        const check = checkDraft(seed);
        if (!check.ok) rejected.push(`${topic}: ${check.reason}: ${seed}`);
      }
    }
    expect(rejected).toEqual([]);
  });
});

describe("the bank", () => {
  /** Bank text is the fallback for every opening, so it must pass the same gate. */
  it("has every level speakable as an opening", () => {
    for (const id of TOPIC_IDS) {
      for (const level of [1, 2, 3]) {
        expect(checkOpening(questionFor(id, level)), `${id} L${level}`).toBe(true);
      }
    }
  });

  it("gives every topic a kind and a purpose", () => {
    for (const id of TOPIC_IDS) {
      expect(BANK[id].kind).toBe(TOPIC_KINDS[id]);
      expect(BANK[id].purpose.length).toBeGreaterThan(10);
    }
  });

  /** The audit's example: a focused, answerable version of the persuasion question. */
  it("asks the persuasion question about a teammate or stakeholder and a different approach", () => {
    expect(questionFor("persuasion", 1)).toMatch(/teammate or stakeholder.*different approach/);
  });

  /**
   * Follow-up seeds are the rate-limited path: no story question may demand a
   * number for its outcome. (A data question asking which numbers to look at
   * is about the method, not a demand for a metric, so is out of scope.)
   */
  it("has no fallback follow-up on a story question that demands a metric", () => {
    for (const id of TOPIC_IDS.filter((t) => ["behavioral", "motivational"].includes(TOPIC_KINDS[t]))) {
      const seeds = [...BANK[id].seeds.deepen, ...Object.values(BANK[id].seeds.clarify).flat()];
      for (const seed of seeds) expect(seed, `${id}: ${seed}`).not.toMatch(/number|metric|percent|measure/i);
    }
  });
});
