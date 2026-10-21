import { describe, expect, it } from "vitest";

import { groupIntoQuestions, overallScoresFor, rollupQuestions, type GroupableTurn } from "./stats";

const story = (n: number) => ({
  relevance: n,
  specificity: n,
  ownership: n,
  reasoning: n,
  outcome: n,
  communication: n,
});

const turn = (
  seq: number,
  questionType: string,
  scores: GroupableTurn["scores"],
  topic = "teamwork",
  source = "bank",
): GroupableTurn => ({ seq, questionType, topic, source, scores });

describe("groupIntoQuestions — a follow-up adds to the question it came from", () => {
  it("groups each opening with the follow-ups after it", () => {
    const groups = groupIntoQuestions([
      turn(1, "opening", story(2)),
      turn(2, "clarify", story(3)),
      turn(3, "deepen", story(4)),
      turn(4, "opening", story(3), "conflict"),
    ]);
    expect(groups.map((g) => g.turns.map((t) => t.seq))).toEqual([[1, 2, 3], [4]]);
    expect(groups[0].followUps.map((t) => t.questionType)).toEqual(["clarify", "deepen"]);
  });

  /**
   * The user's rule: an opening that missed the outcome, and a follow-up that
   * supplied it, score as the complete answer. The follow-up's evaluation is
   * cumulative, so it IS the question's score.
   */
  it("scores a question by its latest cumulative evaluation", () => {
    const [q] = groupIntoQuestions([turn(1, "opening", story(2)), turn(2, "clarify", story(4))]);
    expect(q.score).toBe(4);
    expect(q.scoredTurn?.seq).toBe(2);
  });

  it("falls back to an earlier evaluation when the latest was unscored", () => {
    const [q] = groupIntoQuestions([turn(1, "opening", story(3)), turn(2, "clarify", null)]);
    expect(q.score).toBe(3);
  });

  it("leaves a question unscored only when no turn of it was scored", () => {
    const [q] = groupIntoQuestions([turn(1, "opening", null), turn(2, "clarify", null)]);
    expect(q.score).toBeNull();
    expect(q.scores).toBeNull();
  });

  it("sorts by seq, and keeps a stray follow-up rather than dropping it", () => {
    const groups = groupIntoQuestions([turn(2, "opening", story(3)), turn(1, "clarify", story(2))]);
    expect(groups.map((g) => g.opening.seq)).toEqual([1, 2]);
  });

  it("takes the rubric from the opening: topic, or resume for a resume-led thread", () => {
    const groups = groupIntoQuestions([
      turn(1, "opening", null, "technical_knowledge"),
      turn(2, "opening", null, "teamwork", "resume"),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["technical", "resume"]);
  });

  /** Old sessions group the same way, scored by the formula they were banded with. */
  it("groups and scores a legacy STAR session", () => {
    const legacy = { situation: 3, task: 3, action: 3, result: 3, specificity: 3, impact: 3, ownership: 3, relevance: 3 };
    const [q] = groupIntoQuestions([turn(1, "opening", { ...legacy, result: 1 }), turn(2, "clarify", legacy)]);
    expect(q.score).toBe(3);
  });
});

describe("rollupQuestions", () => {
  it("averages question scores, never turns", () => {
    const rollup = rollupQuestions(
      groupIntoQuestions([
        turn(1, "opening", story(2)),
        turn(2, "clarify", story(4)),
        turn(3, "opening", story(3), "conflict"),
      ]),
    );
    // (4 + 3) / 2 — not (2 + 4 + 3) / 3, which would charge the gap twice.
    expect(rollup.overall).toBe(3.5);
    expect(rollup.questionsAsked).toBe(2);
    expect(rollup.questionsScored).toBe(2);
  });

  it("averages each dimension only over the questions it applies to", () => {
    const technical = { relevance: 4, accuracy: 2, reasoning: 4, specificity: 4, communication: 4 };
    const rollup = rollupQuestions(
      groupIntoQuestions([
        turn(1, "opening", story(2)),
        turn(2, "opening", technical, "technical_knowledge"),
      ]),
    );
    expect(rollup.dimensions.ownership).toBe(2);
    expect(rollup.dimensions.accuracy).toBe(2);
    expect(rollup.dimensions.reasoning).toBe(3);
  });

  it("reports per competency", () => {
    const rollup = rollupQuestions(
      groupIntoQuestions([
        turn(1, "opening", story(4)),
        turn(2, "opening", story(2), "conflict"),
        turn(3, "opening", story(3)),
      ]),
    );
    expect(rollup.competencies).toEqual([
      { topic: "teamwork", kind: "behavioral", score: 3.5, questions: 2 },
      { topic: "conflict", kind: "behavioral", score: 2, questions: 1 },
    ]);
  });

  it("leaves unscored questions out of every figure", () => {
    const rollup = rollupQuestions(
      groupIntoQuestions([turn(1, "opening", story(4)), turn(2, "opening", null, "conflict")]),
    );
    expect(rollup.overall).toBe(4);
    expect(rollup.questionsAsked).toBe(2);
    expect(rollup.questionsScored).toBe(1);
  });
});

describe("overallScoresFor", () => {
  it("stores the dimension means beside the overall figure", () => {
    expect(overallScoresFor([turn(1, "opening", story(3))])).toEqual({ ...story(3), overall: 3 });
  });

  it("is null when nothing was scored", () => {
    expect(overallScoresFor([turn(1, "opening", null)])).toBeNull();
    expect(overallScoresFor([])).toBeNull();
  });
});
