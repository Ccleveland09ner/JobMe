import { describe, expect, it } from "vitest";

import type { ResumeItem } from "../engine/types";
import { fallbackResumeQuestion } from "./resume-questions";

const role = (label: string, employer?: string): ResumeItem => ({ id: "r", kind: "role", label, employer, chunkSeqs: [], relevanceToRole: 1, covered: false });

describe("fallbackResumeQuestion", () => {
  // Items built from a resume label a role "Title at Employer" and also carry the employer.
  it("names the employer once", () => {
    expect(fallbackResumeQuestion(role("Backend Intern at Acme", "Acme"))).toBe(
      "Walk me through a piece of work you're proud of from your time as Backend Intern at Acme.",
    );
    expect(fallbackResumeQuestion(role("Backend Intern", "Acme"))).toBe(
      "Walk me through a piece of work you're proud of from your time as Backend Intern at Acme.",
    );
    expect(fallbackResumeQuestion(role("Backend Intern"))).toBe(
      "Walk me through a piece of work you're proud of from your time as Backend Intern.",
    );
  });

  it("asks about a project's own decisions", () => {
    expect(fallbackResumeQuestion({ ...role("JobMe"), kind: "project" })).toBe(
      "Walk me through JobMe — what you built yourself, and the hardest decision you made on it.",
    );
  });
});
