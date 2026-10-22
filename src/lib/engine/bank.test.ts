import { describe, expect, it } from "vitest";

import { checkDraft } from "../ai/questions";
import { clarifySeeds, deepenSeeds } from "./bank";
import { DIMENSIONS, TOPIC_IDS } from "./types";

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
