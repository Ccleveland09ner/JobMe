/**
 * Whole interviews through the pipeline the routes actually call — every
 * answer via `runTurn`, every row via `turnRowFor`, the scorecard via
 * `runReport` — against an in-memory database, with the network forbidden.
 *
 * The engine's own tests prove `step()`. These prove the brief's end-to-end
 * guarantees at the level a candidate experiences them (Backend brief §5.5,
 * §8): a session with the evaluator down still reaches a scorecard, and a
 * scripted session is bounded, deterministic and makes no network call.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EvalError, type RawEvaluation } from "../ai/evaluate";
import { questionFor } from "../engine/bank";
import { initState } from "../engine/policy";
import {
  QUICK_QUESTION_CAP,
  type Dimension,
  type Question,
  type Scores,
  type TopicId,
} from "../engine/types";
import {
  runReport,
  type ReportStore,
  type ReportTurnRow,
  type StoredReport,
} from "./report";
import { runTurn, turnRowFor, type TurnContext } from "./turn";

const TOPICS: TopicId[] = ["teamwork", "conflict", "pressure", "leadership"];

const FIRST: Question = {
  text: questionFor("teamwork", 1),
  type: "opening",
  topic: "teamwork",
  difficulty: 1,
  source: "bank",
};

/** Long enough, and with a number, that the pre-classifier defers to the evaluator. */
const ANSWER =
  "I led the checkout fix: I profiled the service, found a quadratic " +
  "comparison, rewrote it with bucketing, and p99 fell from 1,200 ms to " +
  "340 ms within 2 days.";

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

function raw(scores: Scores): RawEvaluation {
  return {
    scores,
    observation: "Scripted",
    off_topic: false,
    repeats_previous: false,
    drafts: {
      deepen: "What trade-off did you weigh when you chose bucketing?",
      clarify: "What did you personally change in the checkout service?",
    },
  };
}

const fetchSpy = vi.fn(() => {
  throw new Error("The network is forbidden in this test.");
});

beforeEach(() => {
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Answers every question until the engine wraps, recording what a route would. */
async function interview(evaluate: NonNullable<TurnContext["evaluate"]>) {
  let state = initState({
    mode: "quick",
    topics: TOPICS,
    resumeItems: [],
    firstQuestion: FIRST,
  });
  const rows: ReportTurnRow[] = [];
  const moves: string[] = [];
  const responses: unknown[] = [];
  let maxFollowUps = 0;

  for (let turn = 0; turn < 40 && !state.done; turn++) {
    const ctx: TurnContext = {
      state,
      transcript: ANSWER,
      holdMs: 20_000,
      captureMs: 15_000,
      evaluate,
    };
    const result = await runTurn(ctx);
    if (result.kind !== "turn") throw new Error("unexpected nudge");

    const row = turnRowFor(ctx, result);
    rows.push({
      id: `turn-${result.state.turnSeq}`,
      seq: result.state.turnSeq,
      questionText: String(row.question_text),
      answerTranscript: String(row.answer_transcript),
      scores: row.scores as Scores | null,
      primaryGap: row.primary_gap as Dimension | null,
      captureMs: row.capture_ms as number | null,
    });
    moves.push(result.move);
    responses.push({ notepad: result.notepad, next: result.next, lead: result.lead });
    maxFollowUps = Math.max(maxFollowUps, result.state.followUpsUsed);
    state = result.state;
  }

  return { state, rows, moves, responses, maxFollowUps };
}

/** The report tables, in memory, seeded with the turns an interview wrote. */
function reportStore(rows: ReportTurnRow[]): ReportStore {
  let report: StoredReport | null = null;
  let completed = false;
  return {
    loadSession: async () => ({
      status: completed ? "completed" : "in_progress",
      overallScores: null,
    }),
    loadReport: async () => report,
    loadTurns: async () => rows,
    insertReport: async (r) => {
      if (report) return "exists";
      report = r;
      return "inserted";
    },
    completeSession: async () => {
      completed = true;
    },
  };
}

describe("a whole interview through the pipeline", () => {
  /**
   * Brief §8: "with the evaluator forced to fail, a full session still
   * completes and reaches a scorecard". The model is down for every turn.
   */
  it("finishes and reaches a scorecard with the evaluator down throughout", async () => {
    const evaluate = vi.fn(async () => {
      throw new EvalError("Rate limited (free tier is 15 requests/minute).", true);
    });

    const { state, rows, responses } = await interview(evaluate);

    expect(state.done).toBe(true);
    expect(state.questionCount).toBeLessThanOrEqual(QUICK_QUESTION_CAP);
    expect(rows.length).toBeGreaterThanOrEqual(TOPICS.length);
    // Every turn kept, and every one honestly unscored.
    expect(rows.every((r) => r.scores === null)).toBe(true);

    const generateText = vi.fn();
    const outcome = await runReport(reportStore(rows), { generateText });

    expect(outcome.status).toBe(200);
    // Nothing was scored, so there is nothing to rewrite — and no call to make.
    expect(generateText).not.toHaveBeenCalled();
    expect(outcome.body).toMatchObject({ rewrite: null, overallScores: null });
    expect(outcome.body).toHaveProperty("stats.answered", rows.length);

    // The failure never reaches the candidate, in any response.
    expect(JSON.stringify([responses, outcome.body])).not.toMatch(
      /rate limit|requests\/minute|EvalError|gemini|stack/i,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  /** All strong: Deepen, resolve one level harder, repeat — then wrap. */
  it("runs a strong session: deepens, climbs difficulty, and stays deterministic", async () => {
    const evaluate = vi.fn(async () => raw(flat(4)));

    const first = await interview(evaluate);
    const second = await interview(vi.fn(async () => raw(flat(4))));

    expect(first.moves).toEqual([
      "deepen", "opening",
      "deepen", "opening",
      "deepen", "opening",
      "deepen", "wrap",
    ]);
    expect(second.moves).toEqual(first.moves);
    // Bumped after each great thread, and capped at 3.
    expect(first.state.difficulty).toBe(3);
    // One evaluation per answer, and nothing else — no hidden model calls.
    expect(evaluate).toHaveBeenCalledTimes(first.rows.length);
    expect(fetchSpy).not.toHaveBeenCalled();

    const generateText = vi.fn(async () => ({ summary: "Strong session.", rewrite: null }));
    const outcome = await runReport(reportStore(first.rows), { generateText });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(outcome.body).toMatchObject({ overallScores: flat(4) });
  });

  /**
   * Mediocre answers that keep improving: two Clarifies per thread (never
   * three), no difficulty bump, and a hard stop at the cap even mid-thread.
   */
  it("caps a long mediocre session at the question limit", async () => {
    let n = 0;
    // Impact climbs 1 -> 2 -> 3 within each thread, so no follow-up plateaus;
    // everything else sits at 3, which keeps every answer mediocre.
    const evaluate = vi.fn(async () =>
      raw({ ...flat(3), impact: 1 + (n++ % 3) }),
    );

    const { state, moves, maxFollowUps } = await interview(evaluate);

    expect(moves).toEqual([
      "clarify", "clarify", "opening",
      "clarify", "clarify", "opening",
      "clarify", "clarify", "opening",
      "wrap",
    ]);
    expect(state.questionCount).toBe(QUICK_QUESTION_CAP);
    expect(maxFollowUps).toBe(2);
    // No thread ended great, so the difficulty never moved.
    expect(state.difficulty).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
