import { describe, expect, it, vi } from "vitest";

import type { ReportDraft } from "../ai/report";
import type { Scores } from "../engine/types";
import {
  runReport,
  type ReportOutcome,
  type ReportSessionRow,
  type ReportStore,
  type ReportTurnRow,
  type StoredReport,
} from "./report";

const flat = (n: number): Scores => ({
  relevance: n,
  specificity: n,
  ownership: n,
  reasoning: n,
  outcome: n,
  communication: n,
});

function turn(
  seq: number,
  scores: Scores | null,
  questionType: "opening" | "clarify" | "deepen" = "opening",
  topic = "teamwork",
): ReportTurnRow {
  return {
    id: `turn-${seq}`,
    seq,
    questionType,
    topic,
    source: "bank",
    questionText: `Question ${seq}?`,
    answerTranscript: `Answer number ${seq} about the checkout service.`,
    scores,
    primaryGap: scores ? "outcome" : null,
    captureMs: 4000,
  };
}

/** The database, reduced to what the pipeline touches. */
function memoryStore(opts: {
  session?: ReportSessionRow | null;
  turns?: ReportTurnRow[];
  report?: StoredReport | null;
}) {
  const db = {
    session:
      opts.session === undefined
        ? ({ status: "in_progress", overallScores: null } as ReportSessionRow)
        : opts.session,
    turns: opts.turns ?? [],
    report: opts.report ?? null,
    completions: 0,
  };

  const store: ReportStore = {
    loadSession: async () => (db.session ? { ...db.session } : null),
    loadReport: async () => (db.report ? { ...db.report } : null),
    loadTurns: async () => [...db.turns],
    insertReport: async (report) => {
      if (db.report) return "exists";
      db.report = report;
      return "inserted";
    },
    completeSession: async (overallScores) => {
      db.completions++;
      if (db.session) db.session = { status: "completed", overallScores };
    },
  };
  return { store, db };
}

const DRAFT: ReportDraft = {
  summary: "Say how your stories turned out.",
  rewrite: "I took on the backend… [result].",
  feedback: { strengths: [], improvements: [] },
};


/** A filed report's body; anything else fails the test. */
function bodyOf(outcome: ReportOutcome) {
  if (outcome.kind !== "filed") throw new Error(`expected a filed report, got ${outcome.kind}`);
  return outcome.body;
}

describe("runReport", () => {
  it("generates once and marks the session completed", async () => {
    const { store, db } = memoryStore({ turns: [turn(1, flat(2)), turn(2, flat(3))] });
    const generateText = vi.fn(async () => DRAFT);

    const outcome = await runReport(store, { generateText });

    expect(outcome.kind).toBe("filed");
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(db.report?.rewrite).toBe(DRAFT.rewrite);
    expect(db.session?.status).toBe("completed");
  });

  /** The brief's requirement: a second call makes no LLM call. */
  it("is idempotent — the second call returns the stored report without the model", async () => {
    const { store } = memoryStore({ turns: [turn(1, flat(2))] });
    const generateText = vi.fn(async () => DRAFT);

    const first = await runReport(store, { generateText });
    const second = await runReport(store, { generateText });

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(bodyOf(second)).toEqual(bodyOf(first));
    expect(second).toMatchObject({ generated: false });
  });

  /** End early must work from a single answered turn. */
  it("works with exactly one answered turn", async () => {
    const { store } = memoryStore({ turns: [turn(1, flat(2))] });
    const outcome = await runReport(store, { generateText: async () => DRAFT });
    expect(outcome.kind).toBe("filed");
    expect(bodyOf(outcome)).toMatchObject({ weakestTurnId: "turn-1" });
  });

  it("refuses to build a report from zero answers", async () => {
    const { store, db } = memoryStore({ turns: [] });
    const outcome = await runReport(store, { generateText: async () => DRAFT });
    expect(outcome.kind).toBe("nothing-answered");
    expect(db.report).toBeNull();
    expect(db.completions).toBe(0);
  });

  /** RLS makes another user's session invisible, so this is also "not yours". */
  it("answers 404 for a session it cannot see", async () => {
    const { store } = memoryStore({ session: null });
    expect((await runReport(store)).kind).toBe("not-found");
  });

  it("excludes unscored turns from every average and from the weakest pick", async () => {
    const { store } = memoryStore({
      turns: [turn(1, flat(4)), turn(2, null), turn(3, flat(2))],
    });
    const generateText = vi.fn(async () => DRAFT);
    const outcome = await runReport(store, { generateText });

    // (4 + 2) / 2 — the unscored turn neither drags nor lifts the average.
    expect(bodyOf(outcome)).toMatchObject({
      overallScores: { ...flat(3), overall: 3 },
      weakestTurnId: "turn-3",
    });
    expect(bodyOf(outcome)).toHaveProperty("stats.answered", 3);
    expect(bodyOf(outcome)).toHaveProperty("stats.scored", 2);
  });

  it("spends no model call when nothing was scored, and still reports", async () => {
    const { store } = memoryStore({ turns: [turn(1, null), turn(2, null)] });
    const generateText = vi.fn(async () => DRAFT);

    const outcome = await runReport(store, { generateText });

    expect(generateText).not.toHaveBeenCalled();
    expect(outcome.kind).toBe("filed");
    expect(bodyOf(outcome)).toMatchObject({
      rewrite: null,
      overallScores: null,
      weakestTurnId: null,
    });
  });

  it("saves the report without a rewrite when the model fails", async () => {
    const { store, db } = memoryStore({ turns: [turn(1, flat(2))] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const outcome = await runReport(store, {
      generateText: async () => {
        throw new Error("Rate limited (free tier is 15 requests/minute).");
      },
    });

    warn.mockRestore();
    expect(outcome.kind).toBe("filed");
    expect(bodyOf(outcome)).toMatchObject({ rewrite: null });
    expect(bodyOf(outcome).summary).toMatch(/Across 1 question/);
    expect(db.session?.status).toBe("completed");
    // The failure is logged server-side, never returned.
    expect(JSON.stringify(bodyOf(outcome))).not.toMatch(/rate limited|requests\/minute/i);
  });

  it("returns the winner's report when a concurrent request inserted first", async () => {
    const winner: StoredReport = {
      summary: "The first request's summary.",
      weakestTurnId: "turn-1",
      rewrite: null,
      stats: { wpm: 90, fillers: 0, fillersApproximate: true, answered: 1, scored: 1 },
    };
    const { store } = memoryStore({ turns: [turn(1, flat(2))] });
    // Simulate losing the race: the row appears between our load and insert.
    const insert = store.insertReport;
    store.insertReport = async (report) => {
      await insert(winner);
      return insert(report);
    };

    const outcome = await runReport(store, { generateText: async () => DRAFT });
    expect(bodyOf(outcome)).toMatchObject({ summary: winner.summary });
  });

  // A crash between the two writes must never leave a filed report on an
  // interview the ledger still offers to resume.
  it("completes the interview before filing its report", async () => {
    const { store, db } = memoryStore({ turns: [turn(1, flat(2))] });
    store.insertReport = async () => {
      throw new Error("connection lost");
    };
    await expect(runReport(store, { generateText: async () => DRAFT })).rejects.toThrow("connection lost");
    expect(db.session?.status).toBe("completed");
    expect(db.report).toBeNull();
  });

  it("keeps the end time the turn route stamped, and stamps one for End early", async () => {
    const ended: string[] = [];
    for (const endedAt of ["2026-10-20T09:30:00.000Z", null]) {
      const { store } = memoryStore({ session: { status: "in_progress", overallScores: null, endedAt }, turns: [turn(1, flat(2))] });
      store.completeSession = async (_scores, at) => void ended.push(at);
      await runReport(store, { generateText: async () => DRAFT });
    }
    expect(ended[0]).toBe("2026-10-20T09:30:00.000Z");
    expect(new Date(ended[1]).getTime()).toBeGreaterThan(Date.parse("2026-01-01"));
  });

  it("heals a session left in progress by a crash after the insert", async () => {
    const existing: StoredReport = {
      summary: "Already generated.",
      weakestTurnId: null,
      rewrite: null,
      stats: { wpm: null, fillers: 0, fillersApproximate: true, answered: 1, scored: 0 },
    };
    const { store, db } = memoryStore({ turns: [turn(1, null)], report: existing });
    const generateText = vi.fn(async () => DRAFT);

    await runReport(store, { generateText });

    expect(generateText).not.toHaveBeenCalled();
    expect(db.session?.status).toBe("completed");
  });
});

describe("runReport — a follow-up adds to the question it came from", () => {
  /**
   * The opening missed the outcome (2s); the clarify supplied it, and its
   * cumulative evaluation of the whole answer is 4s. The question scores 4:
   * the less complete evaluation before the follow-up is never averaged in.
   */
  it("scores each original question by its latest cumulative evaluation", async () => {
    const { store } = memoryStore({
      turns: [turn(1, flat(2)), turn(2, flat(4), "clarify"), turn(3, flat(3), "opening", "conflict")],
    });
    const outcome = await runReport(store, { generateText: async () => DRAFT });

    // Two questions, (4 + 3) / 2 — not three turns averaging (2 + 4 + 3) / 3.
    expect(bodyOf(outcome)).toHaveProperty("overallScores.overall", 3.5);
    expect(bodyOf(outcome)).toHaveProperty("stats.answered", 2);
    // Weakest is the conflict question; the first is now complete.
    expect(bodyOf(outcome)).toMatchObject({ weakestTurnId: "turn-3" });
  });

  it("sends the model each question with its follow-ups, and cites the opening as weakest", async () => {
    const { store } = memoryStore({
      turns: [turn(1, flat(1)), turn(2, flat(2), "clarify"), turn(3, flat(3), "opening", "conflict")],
    });
    const generateText = vi.fn(async () => DRAFT);
    const outcome = await runReport(store, { generateText });

    const [args] = generateText.mock.calls[0] as unknown as [
      { questions: { ref: string; parts: unknown[] }[]; weakestRef: string },
    ];
    expect(args.questions.map((q) => [q.ref, q.parts.length])).toEqual([["Q1", 2], ["Q2", 1]]);
    expect(args.weakestRef).toBe("Q1");
    expect(bodyOf(outcome)).toMatchObject({ weakestTurnId: "turn-1" });
  });

  /** A technical question has no Ownership; it must not count as a zero there. */
  it("averages each dimension only over the questions it applies to", async () => {
    const technical = { relevance: 4, accuracy: 4, reasoning: 4, specificity: 4, communication: 4 };
    const { store } = memoryStore({
      turns: [turn(1, flat(2)), turn(2, technical, "opening", "technical_knowledge")],
    });
    const outcome = await runReport(store, { generateText: async () => DRAFT });

    expect(bodyOf(outcome)).toHaveProperty("overallScores.ownership", 2);
    expect(bodyOf(outcome)).toHaveProperty("overallScores.accuracy", 4);
    expect(bodyOf(outcome)).toHaveProperty("overallScores.reasoning", 3);
  });

  it("stores the feedback with the report", async () => {
    const feedback = {
      strengths: [{ question: "Q1", point: "Clear ownership.", quote: "Answer number 1" }],
      improvements: [],
    };
    const { store, db } = memoryStore({ turns: [turn(1, flat(2))] });
    await runReport(store, { generateText: async () => ({ ...DRAFT, feedback }) });
    expect(db.report?.stats.feedback).toEqual(feedback);
  });
});
