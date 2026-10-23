import { describe, expect, it } from "vitest";

import {
  ROLE_SPECIFIC_TOPICS,
  defaultTopics,
  inferSeniority,
  repairTopics,
  roleFamily,
} from "./roles";
import { TOPIC_IDS } from "./types";

/** A fixed sequence in place of Math.random, so a run repeats exactly. */
const seeded = (seed = 1) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
};

describe("roleFamily", () => {
  it.each([
    ["Software Engineering Intern", "software"],
    ["Frontend Developer", "software"],
    ["Backend Engineer, Payments", "software"],
    ["Product Manager Intern", "product"],
    ["Associate PM", "product"],
    ["Data Analyst Intern", "data"],
    ["Data Engineer", "data"],
    ["Machine Learning Engineer", "data"],
    ["Marketing Coordinator", "general"],
    ["Barista", "general"],
  ])("%s -> %s", (title, family) => {
    expect(roleFamily(title)).toBe(family);
  });

  it("reads the job description's opening when there is no title", () => {
    expect(roleFamily(null, "Product Manager Intern. Work with designers and engineers.")).toBe("product");
  });

  it("is general when nothing is known, rather than guessing", () => {
    expect(roleFamily(null, null)).toBe("general");
    expect(roleFamily("", "")).toBe("general");
  });
});

describe("inferSeniority", () => {
  it.each([
    ["Software Engineering Intern", "intern"],
    ["Summer Internship — Product", "intern"],
    ["New Grad Software Engineer", "entry-level"],
    ["Junior Data Analyst", "entry-level"],
    ["Senior Product Manager", "senior"],
    ["Software Engineer", null],
  ])("%s -> %s", (title, level) => {
    expect(inferSeniority(title)).toBe(level);
  });

  /** "lead a project" is a responsibility, not a level. */
  it("does not read a responsibility deep in the posting as a level", () => {
    const jd = "Product Manager. " + "x ".repeat(100) + "You will lead a small project.";
    expect(inferSeniority(null, jd)).toBeNull();
  });
});

describe("defaultTopics — the interview fits the role even with no model", () => {
  it("opens with motivation, then the family's own question", () => {
    expect(defaultTopics("software", 4, seeded()).slice(0, 2)).toEqual(["motivation", "technical_knowledge"]);
    expect(defaultTopics("product", 4, seeded()).slice(0, 2)).toEqual(["motivation", "product_sense"]);
    expect(defaultTopics("data", 4, seeded()).slice(0, 2)).toEqual(["motivation", "data_reasoning"]);
  });

  it("keeps a general role behavioural", () => {
    const topics = defaultTopics("general", 4, seeded());
    expect(topics[0]).toBe("motivation");
    expect(topics.some((t) => ROLE_SPECIFIC_TOPICS.includes(t))).toBe(false);
  });

  /** The baseline asked a PM intern "the most technically challenging thing you have built". */
  it("gives a software and a product role materially different interviews", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const swe = defaultTopics("software", 6, seeded(seed));
      const pm = defaultTopics("product", 6, seeded(seed));
      expect(pm).not.toContain("technical_challenge");
      expect(pm).not.toContain("technical_knowledge");
      expect(swe).not.toContain("product_sense");
      const shared = swe.filter((t) => pm.includes(t));
      // Motivation, plus at most the competencies both families are screened on.
      expect(shared.length).toBeLessThanOrEqual(4);
    }
  });

  it("never repeats a topic", () => {
    const topics = defaultTopics("general", 6, seeded(7));
    expect(new Set(topics).size).toBe(topics.length);
  });

  it("is deterministic for a given random source", () => {
    expect(defaultTopics("software", 6, seeded(3))).toEqual(defaultTopics("software", 6, seeded(3)));
  });
});

describe("repairTopics", () => {
  const defaults = defaultTopics("software", 4, seeded());

  it("keeps the model's choice where it is valid", () => {
    expect(repairTopics(["motivation", "technical_knowledge", "conflict", "learning_fast"], defaults, "software", TOPIC_IDS))
      .toEqual(["motivation", "technical_knowledge", "conflict", "learning_fast"]);
  });

  it("restores motivation first and the role question when the model drops them", () => {
    expect(repairTopics(["conflict", "learning_fast", "teamwork"], defaults, "software", TOPIC_IDS))
      .toEqual(["motivation", "technical_knowledge", "conflict", "learning_fast"]);
  });

  it("drops unknown ids and repeats, then fills from the defaults", () => {
    const repaired = repairTopics(["bravery", "conflict", "conflict"], defaults, "software", TOPIC_IDS);
    expect(repaired.slice(0, 3)).toEqual(["motivation", "technical_knowledge", "conflict"]);
    expect(repaired).toHaveLength(defaults.length);
    expect(new Set(repaired).size).toBe(repaired.length);
  });

  it("allows at most two role-specific questions", () => {
    const repaired = repairTopics(
      ["technical_knowledge", "data_reasoning", "product_sense"],
      defaultTopics("software", 5, seeded()),
      "software",
      TOPIC_IDS,
    );
    expect(repaired.filter((t) => ROLE_SPECIFIC_TOPICS.includes(t))).toHaveLength(2);
  });
});
