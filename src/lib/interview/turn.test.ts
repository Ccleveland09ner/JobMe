import { describe, expect, it, vi } from "vitest";

import { EvalError, type RawEvaluation } from "../ai/evaluate";
import { SCORING_FAILED_LINE } from "../engine/notepad";
import { initState } from "../engine/policy";
import type { EngineState, Question, Scores } from "../engine/types";
import {
  degradedReasonFor,
  isStaleSubmit,
  runTurn,
  threadHistory,
  turnRowFor,
  type TurnContext,
} from "./turn";

const flat = (n: number): Scores => ({
  situation: n,
  task: n,
  action: n,
  result: n,
  specificity: n,
  impact: n,
  ownership: n,
  relevance: n,
});

const FIRST: Question = {
  text: "Tell me about a time you worked on a team to ship something.",
  type: "opening",
  topic: "teamwork",
  difficulty: 1,
  source: "bank",
};

function freshState(): EngineState {
  return initState({
    mode: "quick",
    topics: ["teamwork", "conflict", "pressure", "leadership"],
    resumeItems: [],
    firstQuestion: FIRST,
  });
}

const ANSWER =
  "I owned the checkout outage: I profiled the service, found a quadratic " +
  "comparison, bucketed it by SKU, and p99 went from 1,200 ms to 340 ms.";

function raw(scores: Scores): RawEvaluation {
  return {
    scores,
    observation: "Clear ownership; outcome quantified",
    off_topic: false,
    repeats_previous: false,
    drafts: {
      deepen: "What trade-off did you weigh when you chose bucketing?",
      clarify: "What did you personally change in the checkout service?",
    },
  };
}

function ctx(overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    state: freshState(),
    transcript: ANSWER,
    holdMs: 30_000,
    captureMs: 24_000,
    evaluate: async () => raw(flat(3)),
    ...overrides,
  };
}

describe("runTurn — context reaches the evaluator", () => {
  /**
   * The evaluator is told to score a follow-up against the story so far, and
   * its drafts to build on the candidate's own words. Both were impossible
   * while the pipeline sent an empty history.
   */
  it("passes this thread's earlier answers", async () => {
    const evaluate = vi.fn(async () => raw(flat(3)));
    const history = [{ question: FIRST.text, answer: "We fixed the bug." }];

    await runTurn(ctx({ evaluate, priorThreadTurns: history }));

    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ priorThreadTurns: history }),
    );
  });

  it("prefers the session's own job description over the resume's role title", async () => {
    const evaluate = vi.fn(async () => raw(flat(3)));
    await runTurn(
      ctx({
        evaluate,
        roleText: "Backend intern: Go, Postgres, on-call rotation.",
        role: {
          title: "Software Engineer",
          seniority: "intern",
          requiredSkills: [],
          responsibilities: [],
          competencies: [],
        },
      }),
    );
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        roleText: "Backend intern: Go, Postgres, on-call rotation.",
      }),
    );
  });

  it("falls back to the resume's role title when the session has no job description", async () => {
    const evaluate = vi.fn(async () => raw(flat(3)));
    await runTurn(
      ctx({
        evaluate,
        role: {
          title: "Software Engineer",
          seniority: "intern",
          requiredSkills: [],
          responsibilities: [],
          competencies: [],
        },
      }),
    );
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ roleText: "Software Engineer" }),
    );
  });
});

describe("runTurn — degraded path", () => {
  it("records why scoring failed, but never says so on the notepad", async () => {
    const result = await runTurn(
      ctx({
        evaluate: async () => {
          throw new EvalError("Rate limited (free tier is 15 requests/minute).", true);
        },
      }),
    );

    if (result.kind !== "turn") throw new Error("expected a turn");
    expect(result.degradedReason).toBe("rate_limited");
    expect(result.persistedScores).toBeNull();
    expect(result.notepad.observation).toBe(SCORING_FAILED_LINE);
    expect(JSON.stringify(result.notepad)).not.toMatch(/rate|limit|gemini|error/i);
  });

  it("classifies each failure", () => {
    const live = new AbortController().signal;
    expect(degradedReasonFor(new Error("x"), AbortSignal.abort())).toBe("timeout");
    expect(degradedReasonFor(new EvalError("x", true), live)).toBe("rate_limited");
    expect(degradedReasonFor(new EvalError("x"), live)).toBe("unavailable");
    expect(degradedReasonFor(new Error("network"), live)).toBe("unavailable");
  });
});

describe("runTurn — speaking rate", () => {
  it("computes WPM over capture time", async () => {
    const result = await runTurn(ctx({ captureMs: 60_000 }));
    if (result.kind !== "turn") throw new Error("expected a turn");
    expect(result.stats.wpm).toBe(ANSWER.split(/\s+/).length);
  });

  /** Brief §2.8: hold time under-reports pace, so it is never a stand-in. */
  it("reports no WPM when no capture time was sent, rather than using hold time", async () => {
    const result = await runTurn(ctx({ captureMs: undefined }));
    if (result.kind !== "turn") throw new Error("expected a turn");
    expect(result.stats.wpm).toBeNull();
  });
});

describe("threadHistory", () => {
  const recent = [
    { seq: 5, question_text: "Q5?", answer_transcript: "A5" },
    { seq: 4, question_text: "Q4?", answer_transcript: "A4" },
    { seq: 3, question_text: "Q3?", answer_transcript: "A3" },
  ];

  it("returns exactly this thread's earlier answers, oldest first", () => {
    const state = { ...freshState(), turnSeq: 5, threadScores: [flat(2), flat(2)] };
    expect(threadHistory(state, recent)).toEqual([
      { question: "Q4?", answer: "A4" },
      { question: "Q5?", answer: "A5" },
    ]);
  });

  it("is empty when answering a thread's opening", () => {
    const state = { ...freshState(), turnSeq: 5, threadScores: [] };
    expect(threadHistory(state, recent)).toEqual([]);
  });
});

describe("turnRowFor", () => {
  it("describes the question that was answered, not the next one", async () => {
    const c = ctx();
    const result = await runTurn(c);
    if (result.kind !== "turn") throw new Error("expected a turn");

    const row = turnRowFor(c, result);
    expect(row).toMatchObject({
      question_text: FIRST.text,
      answer_transcript: ANSWER,
      question_source: "bank",
      resume_item_id: null,
      hold_ms: 30_000,
      capture_ms: 24_000,
      degraded_reason: null,
    });
    expect(row.question_text).not.toBe(result.next?.text);
  });

  it("persists an unscored turn with null scores and its reason", async () => {
    const c = ctx({
      captureMs: undefined,
      evaluate: async () => {
        throw new EvalError("boom");
      },
    });
    const result = await runTurn(c);
    if (result.kind !== "turn") throw new Error("expected a turn");

    expect(turnRowFor(c, result)).toMatchObject({
      scores: null,
      band: null,
      primary_gap: null,
      degraded_reason: "unavailable",
      capture_ms: null,
      wpm: null,
    });
  });
});

describe("isStaleSubmit", () => {
  it("recognises both ways a racing duplicate is refused", () => {
    expect(isStaleSubmit({ code: "PT409" })).toBe(true);
    expect(isStaleSubmit({ code: "23505" })).toBe(true);
  });

  it("does not mistake other failures for a race", () => {
    expect(isStaleSubmit({ code: "42501" })).toBe(false);
    expect(isStaleSubmit(null)).toBe(false);
  });
});
