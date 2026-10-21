import { describe, expect, it } from "vitest";

import { fakeSupabase } from "@/lib/testing/fake-supabase";

import type { TurnRow } from "./adapters";
import { packPages } from "./paginate";
import {
  describeFolder,
  folderBook,
  folderFlow,
  FOLDER_FLOW_START,
  isFiled,
  loadReportDocument,
  loadReportIndex,
  reportDocumentFromRows,
  reportTabsFromRows,
  sectionStarts,
  strengths,
  withGeneratedReport,
  type ReportDocument,
} from "./report-document";
import { windowStart } from "./tabs";

const session = {
  id: "s1",
  status: "completed",
  overall_scores: { situation: 3, task: 2, action: 4, result: 1 },
  started_at: "2026-10-18T10:00:00Z",
  mode: "quick",
  role_title: " Backend Intern ",
};

const turn = (seq: number, extra: Partial<TurnRow> = {}): TurnRow & { id: string } => ({
  id: `t${seq}`,
  seq,
  topic: "teamwork",
  question_type: "opening",
  question_text: `Question ${seq}`,
  answer_transcript: "We shipped it. The queue fell from forty minutes to twelve.",
  scores: { situation: 3 },
  band: "mediocre",
  primary_gap: "result",
  evidence: "forty minutes to twelve",
  notepad_text: "Good number.",
  reason_text: "Asked for the result.",
  ...extra,
});

const report = { summary: "Clear stories.", weakest_turn_id: "t1", rewrite_text: "Situation: ...", stats: null };

const doc = (patch: Partial<ReportDocument> = {}): ReportDocument => ({
  ...reportDocumentFromRows(session, [turn(2), turn(1)], report),
  ...patch,
});

describe("reportDocumentFromRows", () => {
  it("shapes the rows the folder files: ordered turns with their notes", () => {
    const d = doc();
    expect(d.title).toBe("Backend Intern");
    expect(d.mode).toBe("quick");
    expect(d.turns.map((t) => t.seq)).toEqual([1, 2]);
    expect(d.turns[0].note).toBe("Good number.");
    expect(d.report?.weakestTurnId).toBe("t1");
    expect(isFiled(d)).toBe(true);
    expect(isFiled(doc({ report: null }))).toBe(false);
    expect(isFiled(doc({ status: "in_progress" }))).toBe(false);
  });

  it("files a report written on the spot, completing the interview", () => {
    const written = withGeneratedReport(doc({ status: "in_progress", report: null }), {
      summary: "Done.",
      weakestTurnId: null,
      rewrite: null,
      stats: { wpm: null, fillers: 0, fillersApproximate: true, answered: 2, scored: 2 },
      overallScores: { task: 2 },
    });
    expect(isFiled(written)).toBe(true);
    expect(written.overallScores).toEqual({ task: 2 });
  });

  it("averages each tab's scores", () => {
    expect(reportTabsFromRows([session])[0]).toMatchObject({ id: "s1", title: "Backend Intern", average: 2.5 });
  });
});

describe("strengths", () => {
  it("names the two best and two worst averages", () => {
    const s = strengths(doc().overallScores);
    expect(s.strongest.map(([d]) => d)).toEqual(["action", "situation"]);
    expect(s.weakest.map(([d]) => d)).toEqual(["result", "task"]);
    expect(strengths(null)).toEqual({ strongest: [], weakest: [] });
  });
});

describe("folderFlow and folderBook", () => {
  it("starts every section on a fresh sheet and runs long answers on", () => {
    const long = "This is one sentence of a long answer. ".repeat(40);
    const flow = folderFlow(doc({ turns: doc().turns.map((t) => ({ ...t, answer: long })) }));
    const sections = flow.filter((b) => b.breakBefore).map((b) => b.id);
    expect(sections).toEqual(["summary", "performance", "feedback", "rewrite", "transcript"]);
    expect(flow.filter((b) => b.kind === "turn-answer" && b.turn === 0).length).toBeGreaterThan(1);
  });

  it("keeps a quote it can't place, beneath the answer", () => {
    const flow = folderFlow(doc({ turns: doc().turns.map((t) => ({ ...t, evidence: "words never said" })) }));
    expect(flow.filter((b) => b.kind === "turn-evidence")).toHaveLength(2);
    expect(folderFlow(doc()).some((b) => b.kind === "turn-evidence")).toBe(false);
  });

  it("is a flap and the sheet that writes the report until it exists, and always an even count", () => {
    expect(folderBook(doc({ report: null }), []).map((p) => p.kind)).toEqual(["flap", "generate"]);
    expect(folderBook(null, []).map((p) => p.kind)).toEqual(["flap", "empty"]);
    const flow = folderFlow(doc());
    const pages = folderBook(doc(), packPages(flow.map((b) => ({ ...b, height: 120 })), { capacity: 450, gap: 14, firstPage: FOLDER_FLOW_START }));
    expect(pages.length % 2).toBe(0);
    const starts = sectionStarts(pages);
    expect(starts.map((s) => s.id)).toEqual(["summary", "performance", "feedback", "rewrite", "transcript"]);
    expect(starts[0].page).toBe(1);
  });
});

describe("windowStart", () => {
  it("moves the run of tabs on show only as far as it must", () => {
    expect(windowStart(20, 5, 2, 0)).toBe(0);
    expect(windowStart(20, 5, 7, 0)).toBe(3);
    expect(windowStart(20, 5, 1, 3)).toBe(1);
    expect(windowStart(20, 5, 19, 0)).toBe(15);
    expect(windowStart(3, 5, 2, 4)).toBe(0);
  });
});

describe("describeFolder", () => {
  it("numbers the report's sheets, not the flap", () => {
    expect(describeFolder({ spread: [0, 1], total: 18 })).toBe("Page 1 of 17");
    expect(describeFolder({ spread: [10, 11], total: 18 })).toBe("Pages 10–11 of 17");
    expect(describeFolder({ spread: [0], total: 18 })).toBe("Inside the flap, 17 pages");
  });
});

describe("loadReportDocument and loadReportIndex", () => {
  it("reads one interview's session, turns and report", async () => {
    const db = fakeSupabase((q) => {
      if (q.table === "interview_sessions") return { data: session };
      if (q.table === "turns") return { data: [turn(2), turn(1)] };
      return { data: report };
    });
    const doc = await loadReportDocument(db.client as never, "s1");
    expect(doc).toMatchObject({ id: "s1", title: "Backend Intern", mode: "quick", report: { weakestTurnId: "t1" } });
    expect(doc?.turns.map((t) => t.seq)).toEqual([1, 2]);
    expect(db.queries.find((q) => q.table === "interview_sessions")?.columns).toContain("mode:engine_state->>mode");
  });

  it("is null for an interview it can't see, and fails loudly on a broken read", async () => {
    expect(await loadReportDocument(fakeSupabase(() => ({ data: null })).client as never, "s1")).toBeNull();
    const broken = fakeSupabase((q) => (q.table === "turns" ? { error: { message: "down" } } : { data: null }));
    await expect(loadReportDocument(broken.client as never, "s1")).rejects.toThrow("report turns: down");
  });

  it("lists finished interviews, newest first, as tabs", async () => {
    const db = fakeSupabase(() => ({ data: [session] }));
    expect(await loadReportIndex(db.client as never)).toEqual([
      { id: "s1", startedAt: session.started_at, mode: "quick", title: "Backend Intern", average: 2.5 },
    ]);
    expect(db.queries[0].filters).toContainEqual(["eq", "status", "completed"]);
    expect(db.queries[0].modifiers).toContain("limit:60");
  });
});
