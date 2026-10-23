import { describe, expect, it } from "vitest";

import { introLineFor, reasonLine, transitionLead } from "./notepad";
import { DIMENSIONS } from "./types";

describe("reasonLine", () => {
  // Built from the move the engine took, so the notepad can never contradict it.
  it("names what a clarify is after, for every gap", () => {
    for (const gap of DIMENSIONS) expect(reasonLine("clarify", gap, "mediocre"), gap).toMatch(/\S → \S/);
    expect(reasonLine("clarify", "outcome", "weak")).toBe("No outcome yet → asking how it turned out");
  });

  it("pushes for trade-offs after a strong answer, and for depth after a solid one", () => {
    expect(reasonLine("deepen", "outcome", "great")).toBe("Strong answer → pushing for trade-offs");
    expect(reasonLine("deepen", "outcome", "mediocre")).toBe("Solid ground → pushing for more depth");
  });

  it("marks a new topic and the wrap", () => {
    expect(reasonLine("opening", "relevance", "weak")).toBe("New topic");
    expect(reasonLine("wrap", "relevance", "great")).toBe("Enough covered → wrapping up");
  });
});

describe("introLineFor", () => {
  it("greets the candidate by name and says any real experience counts", () => {
    expect(introLineFor("Kazu")).toBe(
      "Thanks for making the time, Kazu. When I ask about your experience, examples from school, work, clubs or personal projects all count. Let's get started.",
    );
  });

  it("says out loud when the questions couldn't be tailored to the job", () => {
    expect(introLineFor("Kazu", true)).toMatch(/^Thanks for making the time, Kazu\. I couldn't tailor every question .* Let's get started\.$/);
  });
});

describe("transitionLead", () => {
  // Picked by position, not at random, so a rehearsal repeats exactly.
  it("cycles through its own leads for resume and bank questions", () => {
    expect(transitionLead("resume", 3)).toBe(transitionLead("resume", 0));
    expect(transitionLead("bank", 2)).not.toBe(transitionLead("bank", 1));
    expect(transitionLead("resume", 0)).not.toBe(transitionLead("bank", 0));
  });

  it("takes any position, negative or fractional", () => {
    expect(transitionLead("bank", -1)).toBe(transitionLead("bank", 1));
    expect(transitionLead("bank", 2.7)).toBe(transitionLead("bank", 2));
  });
});
