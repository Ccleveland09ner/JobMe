import { describe, expect, it } from "vitest";

import { formatFactsForPrompt, MAX_FACTS_CHARS, trimFacts } from "./facts";

const list = (prefix: string, n: number, size = 4) => Array.from({ length: n }, (_, i) => `${prefix} ${i} ${"x".repeat(size)}`);

describe("trimFacts", () => {
  it("caps each list and fills in missing ones", () => {
    const trimmed = trimFacts({
      roles: Array.from({ length: 9 }, (_, i) => ({ title: `Role ${i}` })),
      projects: list("project", 9),
      metrics: list("metric", 12),
      skills: list("skill", 20),
    });
    expect([trimmed.roles?.length, trimmed.projects?.length, trimmed.metrics?.length, trimmed.skills?.length]).toEqual([5, 6, 8, 12]);
    expect(trimFacts({})).toEqual({ roles: [], projects: [], metrics: [], skills: [] });
  });

  // A pathological resume must not bloat every turn prompt.
  it("cuts skills, then projects, to two until the facts fit", () => {
    const skillsOnly = trimFacts({ projects: list("project", 6, 60), skills: list("skill", 12, 200) });
    expect([skillsOnly.skills?.length, skillsOnly.projects?.length]).toEqual([2, 6]);

    const roles = [{ title: "Intern" }, { title: "Tutor" }, { title: "Lead" }];
    const both = trimFacts({ roles, projects: list("project", 6, 300), skills: list("skill", 12, 200) });
    expect([both.skills?.length, both.projects?.length, both.roles?.length]).toEqual([2, 2, 3]);
    expect(JSON.stringify(both).length).toBeLessThanOrEqual(MAX_FACTS_CHARS);
  });
});

describe("formatFactsForPrompt", () => {
  it("prints roles, then outcomes, projects and skills", () => {
    const text = formatFactsForPrompt({
      roles: [{ title: "Backend Intern", employer: "Acme", period: "Summer 2025" }, { title: "Tutor" }],
      metrics: ["cut wait times 70%", "200 daily users"],
      projects: ["Queue monitor"],
      skills: ["TypeScript", "SQL"],
    });
    expect(text).toBe(
      [
        "- Backend Intern at Acme (Summer 2025)",
        "- Tutor",
        "Outcomes: cut wait times 70%; 200 daily users",
        "Projects: Queue monitor",
        "Skills: TypeScript, SQL",
      ].join("\n"),
    );
  });

  it("is empty without facts, and leaves out empty lists", () => {
    expect(formatFactsForPrompt(null)).toBe("");
    expect(formatFactsForPrompt({ roles: [], projects: [], metrics: [], skills: [] })).toBe("");
  });
});
