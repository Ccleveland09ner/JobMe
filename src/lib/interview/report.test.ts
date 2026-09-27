import { describe, expect, it, vi } from "vitest";

import type { ReportDraft } from "../ai/report";
import type { Scores } from "../engine/types";
import {
  runReport,
  type ReportSessionRow,
  type ReportStore,
  type ReportTurnRow,
  type StoredReport,
} from "./report";

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

function turn(seq: number, scores: Scores | null): ReportTurnRow {
  return {
    id: `turn-${seq}`,
    seq,
    questionText: `Question ${seq}?`,
    answerTranscript: `Answer number ${seq} about the checkout service.`,
    scores,
    primaryGap: scores ? "impact" : null,
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
  summary: "Put a number on your outcomes.",
  rewrite: "Situation: … Result: [metric].",
};

describe("runReport", () => {
  it("generates once and marks the session completed", async () => {
    const { store, db } = memoryStore({ turns: [turn(1, flat(2)), turn(2, flat(3))] });
    const generateText = vi.fn(async () => DRAFT);

    const outcome = await runReport(store, { generateText });

    expect(outcome.status).toBe(200);
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
    expect(second.body).toEqual(first.body);
    expect(second).toMatchObject({ generated: false });
  });

  /** End early must work from a single answered turn. */
  it("works with exactly one answered turn", async () => {
    const { store } = memoryStore({ turns: [turn(1, flat(2))] });
    const outcome = await runReport(store, { generateText: async () => DRAFT });
    expect(outcome.status).toBe(200);
    expect(outcome.body).toMatchObject({ weakestTurnId: "turn-1" });
  });

  it("refuses to build a report from zero answers", async () => {
    const { store, db } = memoryStore({ turns: [] });
    const outcome = await runReport(store, { generateText: async () => DRAFT });
    expect(outcome.status).toBe(409);
    expect(db.report).toBeNull();
    expect(db.completions).toBe(0);
  });

  /** RLS makes another user's session invisible, so this is also "not yours". */
  it("answers 404 for a session it cannot see", async () => {
    const { store } = memoryStore({ session: null });
    expect((await runReport(store)).status).toBe(404);
  });

  it("excludes unscored turns from every average and from the weakest pick", async () => {
    const { store } = memoryStore({
      turns: [turn(1, flat(4)), turn(2, null), turn(3, flat(2))],
    });
    const generateText = vi.fn(async () => DRAFT);
    const outcome = await runReport(store, { generateText });

    // (4 + 2) / 2 — the unscored turn neither drags nor lifts the average.
    expect(outcome.body).toMatchObject({
      overallScores: flat(3),
      weakestTurnId: "turn-3",
    });
    expect(outcome.body).toHaveProperty("stats.answered", 3);
    expect(outcome.body).toHaveProperty("stats.scored", 2);
  });

  it("spends no model call when nothing was scored, and still reports", async () => {
    const { store } = memoryStore({ turns: [turn(1, null), turn(2, null)] });
    const generateText = vi.fn(async () => DRAFT);

    const outcome = await runReport(store, { generateText });

    expect(generateText).not.toHaveBeenCalled();
    expect(outcome.status).toBe(200);
    expect(outcome.body).toMatchObject({
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
    expect(outcome.status).toBe(200);
    expect(outcome.body).toMatchObject({ rewrite: null });
    expect((outcome.body as { summary: string }).summary).toMatch(/Across 1 answer/);
    expect(db.session?.status).toBe("completed");
    // The failure is logged server-side, never returned.
    expect(JSON.stringify(outcome.body)).not.toMatch(/rate limited|requests\/minute/i);
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
    expect(outcome.body).toMatchObject({ summary: winner.summary });
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
