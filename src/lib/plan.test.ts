import { describe, expect, it } from "vitest";

import { alreadyAsked, normaliseQuestion } from "./engine/asked";
import { levelFor } from "./engine/types";
import { formatRoleForPrompt, roleProfileToQuery, type RoleProfile } from "./jd/profile";
import { companyLineFor, parsePlan, roleTextFor, usableJobText } from "./plan";
import type { QuestionPlan } from "./schemas";

const role: RoleProfile = {
  title: "Backend Intern",
  seniority: "intern",
  requiredSkills: ["Go", "SQL"],
  responsibilities: ["Build payment APIs"],
  competencies: ["ownership"],
};
const plan: QuestionPlan = { version: 1, role, topics: {}, resume: {} };
const job = { title: "Backend Intern", company: "Acme", companyInferred: false, family: "software" as const, seniority: "intern", generated: true };

describe("formatRoleForPrompt", () => {
  it("renders the role, the skills it wants and the competencies to probe", () => {
    expect(formatRoleForPrompt(role)).toBe("Target role: Backend Intern (intern)\nWants: Go, SQL\nCompetencies to probe: ownership");
    expect(formatRoleForPrompt({ ...role, requiredSkills: [], competencies: [] })).toBe("Target role: Backend Intern (intern)");
    expect(formatRoleForPrompt(null)).toBe("");
    // A plan written without the model stores the level as "" when it isn't known.
    expect(formatRoleForPrompt({ ...role, seniority: "", requiredSkills: [], competencies: [] })).toBe("Target role: Backend Intern");
  });

  it("ranks resume items against skills and responsibilities, not just the title", () => {
    expect(roleProfileToQuery(role)).toBe("Backend Intern. intern. Go. SQL. Build payment APIs");
  });
});

describe("reading a stored plan", () => {
  it("parses a plan and treats a malformed one as none", () => {
    expect(parsePlan(plan)).toEqual(plan);
    expect(parsePlan({ version: 2 })).toBeNull();
    expect(parsePlan(null)).toBeNull();
  });

  it("states the job as the plan's role, else the stored posting", () => {
    expect(roleTextFor(plan, "Raw posting")).toBe(formatRoleForPrompt(role));
    expect(roleTextFor({ ...plan, role: null }, "Raw posting")).toBe("Raw posting");
    expect(roleTextFor(null, null)).toBeNull();
  });

  it("names the company, and says when it was read from the link", () => {
    expect(companyLineFor({ ...plan, job })).toBe("Company: Acme");
    expect(companyLineFor({ ...plan, job: { ...job, companyInferred: true } })).toBe("Company: Acme (read from the posting link)");
    expect(companyLineFor({ ...plan, job: { ...job, company: null } })).toBeNull();
    expect(companyLineFor(null)).toBeNull();
  });

  it("only counts text long enough to be a job description", () => {
    expect(usableJobText("asdf")).toBeNull();
    expect(usableJobText(`  ${"x".repeat(80)}  `)).toBe("x".repeat(80));
  });
});

describe("question levels and repeats", () => {
  it("maps a difficulty to a level the way questionFor always has", () => {
    expect([0, 1, 2, 2.5, 3, 7].map(levelFor)).toEqual([1, 1, 2, 1, 3, 3]);
  });

  it("ignores case, punctuation and spacing when checking for a repeat", () => {
    expect(normaliseQuestion("  What did YOU do,   next? ")).toBe("what did you do next");
    expect(alreadyAsked("What did you do next?", ["what did you do next"])).toBe(true);
    expect(alreadyAsked("What happened next?", ["What did you do next?"])).toBe(false);
  });
});
