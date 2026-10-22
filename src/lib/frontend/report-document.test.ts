import { describe, expect, it } from "vitest";

import type { ReportStats } from "@/lib/ai/report";
import { BANK } from "@/lib/engine/bank";
import { fakeSupabase } from "@/lib/testing/fake-supabase";

import type { TurnRow } from "./adapters";
import { topicLabel } from "./labels";
import { packPages } from "./paginate";
import {
  describeFolder,
  folderBook,
  folderFlow,
  FOLDER_COMPETENCY_ROWS,
  FOLDER_FLOW_START,
  isFiled,
  loadReportDocument,
  loadReportIndex,
  reportDocumentFromRows,
  reportTabsFromRows,
  sectionStarts,
  strengths,
  weakestQuestion,
  withGeneratedReport,
  type ReportDocument,
} from "./report-document";
import { windowStart } from "./tabs";

type SessionRow = Parameters<typeof reportDocumentFromRows>[0];
type ReportRow = { summary: string | null; weakest_turn_id: string | null; rewrite_text: string | null; stats: ReportStats | null };
type Row = TurnRow & { id: string };

/** A behavioural answer; its weighted score is 2.7. */
const SCORES = { relevance: 3, specificity: 2, ownership: 4, reasoning: 3, outcome: 1, communication: 3 };

const session: SessionRow = {
  id: "s1",
  status: "completed",
  overall_scores: { ...SCORES, overall: 2.7 },
  started_at: "2026-10-18T10:00:00Z",
  mode: "quick",
  role_title: " Backend Intern ",
  question_plan: null,
};

const turn = (seq: number, extra: Partial<TurnRow> = {}): Row => ({
  id: `t${seq}`,
  seq,
  topic: "teamwork",
  question_type: "opening",
  question_text: `Question ${seq}`,
  answer_transcript: "We shipped it. The queue fell from forty minutes to twelve.",
  scores: SCORES,
  band: "mediocre",
  primary_gap: "outcome",
  evidence: "forty minutes to twelve",
  notepad_text: "Good number.",
  reason_text: "Asked for the result.",
  ...extra,
});

/** Q1 is t1 and its clarify follow-up t2; Q2 is t3. Out of order, as rows may come. */
const TURNS = [turn(3, { topic: "conflict" }), turn(2, { question_type: "clarify", question_text: "What changed?" }), turn(1)];

const report: ReportRow = { summary: "Clear stories.", weakest_turn_id: "t1", rewrite_text: "Situation: ...", stats: null };

const STATS: ReportStats = { wpm: null, fillers: 0, fillersApproximate: true, answered: 2, scored: 2 };

function doc(rows: { turns?: Row[]; session?: Partial<SessionRow>; report?: Partial<ReportRow> | null } = {}, patch: Partial<ReportDocument> = {}): ReportDocument {
  const filed = rows.report === null ? null : { ...report, ...rows.report };
  return { ...reportDocumentFromRows({ ...session, ...rows.session }, rows.turns ?? TURNS, filed), ...patch };
}

const kinds = (flow: ReturnType<typeof folderFlow>, prefix: string) => flow.filter((b) => b.kind.startsWith(prefix));

describe("reportDocumentFromRows", () => {
  it("shapes the rows the folder files: ordered turns with their notes", () => {
    const d = doc();
    expect(d.title).toBe("Backend Intern");
    expect(d.mode).toBe("quick");
    expect(d.turns.map((t) => t.seq)).toEqual([1, 2, 3]);
    expect(d.turns[0].note).toBe("Good number.");
    expect(d.report?.weakestTurnId).toBe("t1");
    expect(isFiled(d)).toBe(true);
    expect(isFiled(doc({ report: null }))).toBe(false);
    expect(isFiled(doc({ session: { status: "in_progress" } }))).toBe(false);
  });

  it("groups each follow-up under the question it added to, as the report did", () => {
    const [q1, q2] = doc().questions;
    expect([q1.ref, q1.label, q1.turns.map((t) => t.id)]).toEqual(["Q1", topicLabel("teamwork"), ["t1", "t2"]]);
    expect(q1.followUps.map((t) => t.id)).toEqual(["t2"]);
    expect([q2.ref, q2.label, q2.turns.map((t) => t.id)]).toEqual(["Q2", topicLabel("conflict"), ["t3"]]);
    // A question's score is its latest cumulative evaluation, weighted for its kind.
    expect(q1.kind).toBe("behavioral");
    expect(q1.scoredTurn?.id).toBe("t2");
    expect(q1.score).toBeCloseTo(2.7);
  });

  it("says what each question assessed: the plan's wording for this job, else the bank's", () => {
    const plan = { version: 1, role: null, topics: { teamwork: { purpose: "working across the payments team" } }, resume: {} };
    expect(doc({ session: { question_plan: plan } }).questions.map((q) => q.purpose)).toEqual([
      "working across the payments team",
      BANK.conflict.purpose,
    ]);
    expect(doc({ session: { question_plan: { version: 9 } } }).questions[0].purpose).toBe(BANK.teamwork.purpose);
  });

  it("shows the stored overall, the plain mean for older sessions, or the questions' own before the report", () => {
    expect(doc().overall).toBe(2.7);
    expect(doc({ session: { overall_scores: { situation: 3, task: 2, action: 4, result: 1 } } }).overall).toBe(2.5);
    expect(doc({ session: { overall_scores: null } }).overall).toBeCloseTo(2.7);
    expect(doc({ turns: [turn(1, { scores: null })], session: { overall_scores: null } }).overall).toBeNull();
  });

  it("files a report written on the spot, completing the interview", () => {
    const written = withGeneratedReport(doc({ session: { status: "in_progress", overall_scores: null }, report: null }), {
      summary: "Done.",
      weakestTurnId: null,
      rewrite: null,
      stats: STATS,
      overallScores: { ...SCORES, overall: 3.12 },
    });
    expect(isFiled(written)).toBe(true);
    expect(written.overall).toBe(3.1);
    expect(written.overallScores).toEqual(SCORES);
  });

  it("gives each tab its overall score", () => {
    expect(reportTabsFromRows([session])[0]).toMatchObject({ id: "s1", title: "Backend Intern", overall: 2.7 });
    expect(reportTabsFromRows([{ ...session, overall_scores: { task: 2, action: 3 } }])[0].overall).toBe(2.5);
  });
});

describe("weakestQuestion", () => {
  it("is the question holding the weakest answer, opening or follow-up", () => {
    expect(weakestQuestion(doc())?.ref).toBe("Q1");
    expect(weakestQuestion(doc({ report: { weakest_turn_id: "t2" } }))?.ref).toBe("Q1");
    expect(weakestQuestion(doc({ report: { weakest_turn_id: "t3" } }))?.ref).toBe("Q2");
    expect(weakestQuestion(doc({ report: { weakest_turn_id: null } }))).toBeNull();
    expect(weakestQuestion(doc({ report: { weakest_turn_id: "gone" } }))).toBeNull();
  });
});

describe("strengths", () => {
  it("names the two best and two worst averages", () => {
    const s = strengths(doc().overallScores);
    expect(s.strongest.map(([d]) => d)).toEqual(["ownership", "relevance"]);
    expect(s.weakest.map(([d]) => d)).toEqual(["outcome", "specificity"]);
    expect(strengths(null)).toEqual({ strongest: [], weakest: [] });
  });

  // Clarity is never a gap: a transcript is too noisy a signal to fault it,
  // and the fallback report ranks the same way.
  it("never names Clarity, and breaks ties in display order", () => {
    const s = strengths({ relevance: 3, ownership: 4, reasoning: 2, outcome: 2, communication: 1 });
    expect(s.strongest.map(([d]) => d)).toEqual(["ownership", "relevance"]);
    expect(s.weakest.map(([d]) => d)).toEqual(["reasoning", "outcome"]);
  });
});

describe("folderFlow and folderBook", () => {
  it("starts every section on a fresh sheet and runs long answers on", () => {
    const long = "This is one sentence of a long answer. ".repeat(40);
    const flow = folderFlow(doc({ turns: TURNS.map((t) => ({ ...t, answer_transcript: long })) }));
    expect(flow.filter((b) => b.breakBefore).map((b) => b.id)).toEqual(["summary", "feedback", "rewrite", "questions", "transcript"]);
    expect(flow.filter((b) => b.kind === "turn-answer" && b.turn === 0).length).toBeGreaterThan(1);
  });

  it("prints each follow-up with the question it added to", () => {
    const flow = folderFlow(doc());
    expect(kinds(flow, "question-scores").map((b) => b.question)).toEqual([0, 1]);
    expect(kinds(flow, "turn-notes").map((b) => [b.question, b.turn])).toEqual([[0, 0], [0, 1], [1, 2]]);
    expect(kinds(flow, "turn-question").map((b) => [b.question, b.turn])).toEqual([[0, 0], [0, 1], [1, 2]]);
  });

  it("keeps a quote it can't place beneath the answer, and says when an answer went unscored", () => {
    const misplaced = folderFlow(doc({ turns: TURNS.map((t) => ({ ...t, evidence: "words never said" })) }));
    expect(kinds(misplaced, "turn-evidence").filter((b) => b.quote)).toHaveLength(3);
    expect(kinds(folderFlow(doc()), "turn-evidence")).toEqual([]);
    expect(kinds(folderFlow(doc({ turns: [turn(1, { scores: null })] })), "turn-evidence")).toEqual([
      expect.objectContaining({ turn: 0, quote: false }),
    ]);
  });

  it("lists what went well and what to work on, or says there is no feedback", () => {
    expect(kinds(folderFlow(doc()), "feedback-").map((b) => b.kind)).toEqual(["feedback-none"]);
    const feedback = { strengths: [{ question: "Q1", point: "Named the number.", quote: "forty minutes to twelve" }], improvements: [] };
    const flow = folderFlow(doc({ report: { stats: { ...STATS, feedback } } }));
    expect(kinds(flow, "feedback-").map((b) => b.id)).toEqual(["fl-strengths", "fi-strengths-0", "fl-improvements"]);
  });

  it("rewrites the weakest question after everything said to it, follow-ups included", () => {
    const flow = folderFlow(doc());
    const rewrite = flow.slice(flow.findIndex((b) => b.id === "rewrite"), flow.findIndex((b) => b.id === "questions"));
    expect(rewrite.map((b) => b.kind)).toEqual(["rewrite", "rewrite-question", "rewrite-said", "rewrite-said", "rewrite-text"]);
    expect(rewrite.filter((b) => b.kind === "rewrite-said").map((b) => b.turn)).toEqual([0, 1]);
    expect(kinds(folderFlow(doc({ report: { rewrite_text: null } })), "rewrite-missing")).toHaveLength(1);
    expect(kinds(folderFlow(doc({ report: { weakest_turn_id: null } })), "rewrite-").map((b) => b.kind)).toEqual(["rewrite-none"]);
  });

  it("lists the competencies a few to a block, once anything was scored", () => {
    const many = Array.from({ length: FOLDER_COMPETENCY_ROWS + 1 }, (_, i) => turn(i + 1));
    expect(kinds(folderFlow(doc({ turns: many })), "competencies").map((b) => b.range)).toEqual([
      [0, FOLDER_COMPETENCY_ROWS],
      [FOLDER_COMPETENCY_ROWS, FOLDER_COMPETENCY_ROWS + 1],
    ]);
    expect(kinds(folderFlow(doc({ turns: [turn(1, { scores: null })], session: { overall_scores: null } })), "competencies")).toEqual([]);
  });

  it("is a flap and the sheet that writes the report until it exists, and always an even count", () => {
    expect(folderBook(doc({ report: null }), []).map((p) => p.kind)).toEqual(["flap", "generate"]);
    expect(folderBook(null, []).map((p) => p.kind)).toEqual(["flap", "empty"]);
    const flow = folderFlow(doc());
    const pages = folderBook(doc(), packPages(flow.map((b) => ({ ...b, height: 120 })), { capacity: 450, gap: 14, firstPage: FOLDER_FLOW_START }));
    expect(pages.length % 2).toBe(0);
    const starts = sectionStarts(pages);
    expect(starts.map((s) => s.id)).toEqual(["summary", "feedback", "rewrite", "questions", "transcript"]);
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
  it("reads one interview's session, with its plan, turns and report", async () => {
    const db = fakeSupabase((q) => {
      if (q.table === "interview_sessions") return { data: session };
      if (q.table === "turns") return { data: TURNS };
      return { data: report };
    });
    const loaded = await loadReportDocument(db.client as never, "s1");
    expect(loaded).toMatchObject({ id: "s1", title: "Backend Intern", mode: "quick", report: { weakestTurnId: "t1" } });
    expect(loaded?.questions.map((q) => q.ref)).toEqual(["Q1", "Q2"]);
    const columns = db.queries.find((q) => q.table === "interview_sessions")?.columns;
    expect(columns).toContain("mode:engine_state->>mode");
    expect(columns).toContain(", question_plan");
  });

  it("is null for an interview it can't see, and fails loudly on a broken read", async () => {
    expect(await loadReportDocument(fakeSupabase(() => ({ data: null })).client as never, "s1")).toBeNull();
    const broken = fakeSupabase((q) => (q.table === "turns" ? { error: { message: "down" } } : { data: null }));
    await expect(loadReportDocument(broken.client as never, "s1")).rejects.toThrow("report turns: down");
  });

  it("lists finished interviews, newest first, as tabs", async () => {
    const db = fakeSupabase(() => ({ data: [session] }));
    expect(await loadReportIndex(db.client as never)).toEqual([
      { id: "s1", startedAt: session.started_at, mode: "quick", title: "Backend Intern", overall: 2.7 },
    ]);
    expect(db.queries[0].filters).toContainEqual(["eq", "status", "completed"]);
    expect(db.queries[0].modifiers).toContain("limit:60");
  });
});
