import { describe, expect, it } from "vitest";

import { formatScore, gapLabel, interviewTitle, scoreLevelLabel, scoreOutOf } from "./labels";

describe("interviewTitle", () => {
  it("names an interview by its job, else by its length", () => {
    expect(interviewTitle("Backend Intern", "quick")).toBe("Backend Intern");
    expect(interviewTitle(null, "quick")).toBe("Quick interview");
    expect(interviewTitle(null, "full")).toBe("Full interview");
    expect(interviewTitle(null, null)).toBe("Interview");
  });
});

describe("gapLabel", () => {
  it("names the gap, current or legacy, and nothing when there is none", () => {
    expect(gapLabel("specificity")).toBe("Specific evidence");
    expect(gapLabel("result")).toBe("Result");
    expect(gapLabel(null)).toBeNull();
    expect(gapLabel(undefined)).toBeNull();
  });
});

describe("score formatting", () => {
  // The bars and the strengths list print the same value the same way.
  it("prints whole numbers bare and averages to one decimal", () => {
    expect(formatScore(3)).toBe("3");
    expect(formatScore(2.67)).toBe("2.7");
  });

  // The ledger and the folder print a headline score the same way.
  it("prints a headline score out of 4 to one decimal", () => {
    expect(scoreOutOf(3)).toBe("3.0 / 4");
    expect(scoreOutOf(2.67)).toBe("2.7 / 4");
  });

  it("reads a score at the band edges as the band does", () => {
    expect(scoreLevelLabel(1.99)).toBe("Needs work");
    expect(scoreLevelLabel(2)).toBe("Developing");
    expect(scoreLevelLabel(3.49)).toBe("Developing");
    expect(scoreLevelLabel(3.5)).toBe("Strong");
  });
});
