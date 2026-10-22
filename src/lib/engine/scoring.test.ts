/**
 * The 2026-10 rubric: one weighted subset of dimensions per question kind.
 * Ref: docs/Scoring-Rubric.md
 */

import { describe, expect, it } from "vitest";

import { classifyBand, computePrimaryGap, gapCandidates, resolveGap } from "./classify";
import { initState, maxFollowUpsFor, shouldResolveTopic, step } from "./policy";
import {
  QUESTION_KINDS,
  WEIGHTS,
  dimensionsFor,
  questionKind,
  weightedScore,
  type Question,
  type Scores,
} from "./types";

const behavioural = (over: Scores = {}): Scores => ({
  relevance: 3,
  specificity: 3,
  ownership: 3,
  reasoning: 3,
  outcome: 3,
  communication: 3,
  ...over,
});

describe("WEIGHTS", () => {
  it("sums to 1 for every kind", () => {
    for (const kind of QUESTION_KINDS) {
      const total = Object.values(WEIGHTS[kind]).reduce((a, b) => a + (b ?? 0), 0);
      expect(total, kind).toBeCloseTo(1, 10);
    }
  });

  /** STAR is a way to tell a story, not a score; and outcome is counted once. */
  it("has no STAR dimensions and no second outcome dimension", () => {
    for (const kind of QUESTION_KINDS) {
      const dims = dimensionsFor(kind) as string[];
      for (const legacy of ["situation", "task", "action", "result", "impact"]) {
        expect(dims).not.toContain(legacy);
      }
    }
  });

  it("scores a technical answer on accuracy, never on ownership or outcome", () => {
    expect(dimensionsFor("technical")).toContain("accuracy");
    expect(dimensionsFor("technical")).not.toContain("ownership");
    expect(dimensionsFor("technical")).not.toContain("outcome");
  });

  /**
   * A transcript is a noisy signal of delivery, so communication stays a
   * small share everywhere — and smallest of all on story questions, where
   * the content is the evidence. It is a little higher where explaining an
   * approach clearly is itself the skill (problem solving, motivation).
   */
  it("keeps communication a small share of every kind", () => {
    for (const kind of QUESTION_KINDS) {
      expect(WEIGHTS[kind].communication!, kind).toBeLessThanOrEqual(0.15);
    }
    expect(WEIGHTS.behavioral.communication).toBe(0.05);
  });
});

describe("questionKind", () => {
  it("follows the topic, and treats any resume-led question as resume", () => {
    expect(questionKind({ topic: "technical_knowledge", source: "bank" })).toBe("technical");
    expect(questionKind({ topic: "product_sense", source: "bank" })).toBe("problem_solving");
    expect(questionKind({ topic: "motivation", source: "bank" })).toBe("motivational");
    expect(questionKind({ topic: "teamwork", source: "resume" })).toBe("resume");
    expect(questionKind({ topic: "something_old", source: "bank" })).toBe("behavioral");
  });
});

describe("weightedScore", () => {
  it("weights by kind", () => {
    // reasoning carries .25 in a behavioural answer, .35 in problem solving.
    const scores = { relevance: 2, specificity: 2, reasoning: 4, accuracy: 2, communication: 2 };
    expect(weightedScore(scores, "technical")).toBeCloseTo(2.5);
    expect(weightedScore(scores, "problem_solving")).toBeCloseTo(2.7);
  });

  it("ignores dimensions the kind does not use, rather than counting them", () => {
    const withStray = { ...behavioural(), accuracy: 1 };
    expect(weightedScore(withStray, "behavioral")).toBeCloseTo(3, 10);
  });

  it("divides by the weight present, so a missing dimension is not a zero", () => {
    expect(weightedScore({ relevance: 4, specificity: 4 }, "motivational")).toBe(4);
    expect(weightedScore({}, "behavioral")).toBeNull();
  });

  /** A session stored before the rubric changed keeps the numbers it showed. */
  it("scores a legacy STAR row the way it was banded then", () => {
    const legacy = { situation: 4, task: 2, action: 4, result: 2, specificity: 3, impact: 3, ownership: 3, relevance: 3 };
    // STAR roll-up 3, then specificity, impact, ownership, relevance: mean 3.
    expect(weightedScore(legacy, "behavioral")).toBe(3);
  });
});

describe("classifyBand by kind", () => {
  /**
   * The calibration case that motivated the change: a correct, well-reasoned
   * technical explanation with no story in it.
   */
  it("bands a strong technical explanation great without any story", () => {
    const strong = { relevance: 4, accuracy: 4, reasoning: 4, specificity: 3, communication: 3 };
    expect(classifyBand(strong, "technical", false)).toBe("great");
  });

  it("bands a confidently wrong technical answer weak", () => {
    const wrong = { relevance: 3, accuracy: 1, reasoning: 1, specificity: 2, communication: 3 };
    expect(classifyBand(wrong, "technical", false)).toBe("weak");
  });

  it("does not let a soft communication score block great", () => {
    expect(classifyBand(behavioural({ relevance: 4, specificity: 4, ownership: 4, reasoning: 4, outcome: 4, communication: 2 }), "behavioral", false))
      .toBe("great");
  });

  it("keeps a solid qualitative answer out of weak", () => {
    // Outcome stated qualitatively, no numbers: 3 across the board is solid.
    expect(classifyBand(behavioural(), "behavioral", false)).toBe("mediocre");
  });
});

describe("gaps by kind", () => {
  it("never offers communication as a gap", () => {
    for (const kind of QUESTION_KINDS) expect(gapCandidates(kind)).not.toContain("communication");
  });

  it("chases accuracy on a technical answer, never ownership", () => {
    const scores = { relevance: 3, accuracy: 2, reasoning: 2, specificity: 3, communication: 3 };
    expect(computePrimaryGap(scores, "technical")).toBe("accuracy");
  });

  it("chases ownership and reasoning before outcome on a story", () => {
    expect(computePrimaryGap(behavioural({ reasoning: 2, outcome: 2 }), "behavioral")).toBe("reasoning");
  });
});

describe("resolveGap", () => {
  it("uses the model's gap when the scores agree it is one, so the reason matches the question", () => {
    expect(resolveGap(behavioural({ outcome: 2, ownership: 2 }), "behavioral", "outcome")).toEqual({
      gap: "outcome",
      fromModel: true,
    });
  });

  it("falls back to the code's gap when the model names a solid dimension", () => {
    expect(resolveGap(behavioural({ ownership: 2 }), "behavioral", "outcome")).toEqual({
      gap: "ownership",
      fromModel: false,
    });
  });

  it("falls back when the model names a dimension the kind does not use", () => {
    expect(resolveGap(behavioural({ ownership: 2 }), "behavioral", "accuracy").gap).toBe("ownership");
  });
});

describe("policy by kind", () => {
  const opening = (over: Partial<Question> = {}): Question => ({
    text: "Tell me a bit about yourself and what draws you to this role.",
    type: "opening",
    topic: "motivation",
    difficulty: 1,
    source: "bank",
    ...over,
  });
  const state = (first: Question) =>
    initState({ mode: "quick", topics: ["motivation", "teamwork", "conflict"], resumeItems: [], firstQuestion: first });

  it("gives a motivational thread one follow-up, a story thread two", () => {
    expect(maxFollowUpsFor(state(opening()))).toBe(1);
    expect(maxFollowUpsFor(state(opening({ topic: "teamwork" })))).toBe(2);
  });

  /** Pressing someone without the experience only invites an invented story. */
  it("moves on when the candidate says they have no such experience", () => {
    const s = initState({
      mode: "quick",
      topics: ["teamwork", "conflict", "pressure"],
      resumeItems: [],
      firstQuestion: opening({ topic: "teamwork", text: "Tell me about a time you worked on a team." }),
    });
    const input = { scores: behavioural({ relevance: 2 }), band: "weak" as const, primaryGap: "specificity" as const, noExperience: true };
    expect(shouldResolveTopic(s, input)).toBe(true);
    const result = step(s, input);
    expect(result.move).toBe("opening");
    expect(result.next?.topic).toBe("conflict");
  });
});
