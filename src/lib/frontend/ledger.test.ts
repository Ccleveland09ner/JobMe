import { describe, expect, it } from "vitest";

import { isLeftPage } from "./book-layout";
import {
  describeLedger,
  excerpt,
  LEDGER_ANSWER_CHARS,
  LEDGER_FLOW_START,
  ledgerBook,
  ledgerEntries,
  ledgerFlow,
  ledgerStartPage,
  pageOf,
  type LedgerEntry,
  type LedgerTurnRow,
} from "./ledger";
import { packPages } from "./paginate";

const session = {
  id: "s1",
  status: "completed",
  question_count: 2,
  overall_scores: { situation: 3, task: 2 },
  started_at: "2026-10-18T10:00:00Z",
  ended_at: "2026-10-18T10:20:00Z",
  mode: "quick",
  role_title: " Backend Intern ",
};

const turn = (seq: number, extra: Partial<LedgerTurnRow> = {}): LedgerTurnRow => ({
  id: `t${seq}`,
  session_id: "s1",
  seq,
  topic: "teamwork",
  question_type: "opening",
  question_text: `Question ${seq}`,
  answer_transcript: "An answer.",
  scores: null,
  band: "mediocre",
  primary_gap: null,
  evidence: null,
  notepad_text: "Needs a result.",
  reason_text: null,
  ...extra,
});

describe("excerpt", () => {
  it("leaves short text alone and cuts long text at a word, with an ellipsis", () => {
    expect(excerpt("  A short   answer. ", 50)).toBe("A short answer.");
    const cut = excerpt("one two three four five six seven", 20);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(21);
    expect("one two three four five six seven".startsWith(cut.slice(0, -1))).toBe(true);
  });
});

describe("ledgerEntries", () => {
  it("puts each session's turns in order under it, with excerpted answers and notes", () => {
    const long = "word ".repeat(200);
    const [entry] = ledgerEntries([session], [turn(2), turn(1, { answer_transcript: long })], [
      { session_id: "s1", summary: " Clear stories. ", stats: { wpm: 132, fillers: 4 } },
    ]);
    expect(entry.title).toBe("Backend Intern");
    expect(entry.mode).toBe("quick");
    expect(entry.questions.map((q) => q.seq)).toEqual([1, 2]);
    expect(entry.questions[0].answer.length).toBeLessThanOrEqual(LEDGER_ANSWER_CHARS + 1);
    expect(entry.questions[1].note).toBe("Needs a result.");
    expect(entry.summary).toBe("Clear stories.");
    expect(entry.wpm).toBe(132);
    expect(entry.fillers).toBe(4);
  });

  it("copes with a session that has no turns and no report yet", () => {
    const [entry] = ledgerEntries([{ ...session, id: "s2", status: "in_progress", role_title: null }], [], []);
    expect(entry.status).toBe("in_progress");
    expect(entry.title).toBeNull();
    expect(entry.questions).toEqual([]);
    expect(entry.summary).toBeNull();
    expect(entry.wpm).toBeNull();
  });
});

const entry = (id: string, extra: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id,
  status: "completed",
  mode: "quick",
  startedAt: "2026-10-18T10:00:00Z",
  endedAt: null,
  questionCount: 2,
  overallScores: null,
  title: null,
  questions: [],
  summary: null,
  wpm: null,
  fillers: null,
  ...extra,
});

const question = (id: string) => ledgerEntries([session], [turn(1, { id })], [])[0].questions[0];

describe("ledgerFlow", () => {
  it("puts the overview on a left page and starts the details on the facing one", () => {
    const flow = ledgerFlow([
      entry("a", { summary: "Good. ".repeat(120), wpm: 120, questions: [question("t1"), question("t2")] }),
      entry("b"),
    ]);
    const kinds = flow.map((b) => b.kind);
    expect(kinds.slice(0, 2)).toEqual(["overview", "summary"]);
    expect(kinds).toContain("metrics");
    expect(flow.filter((b) => b.kind === "summary").length).toBeGreaterThan(1);
    expect(flow.find((b) => b.kind === "questions")?.keepWithNext).toBe(true);
    expect(flow.filter((b) => b.breakBefore).map((b) => b.id)).toEqual(["s-a-0", "p-b"]);
    expect(flow.filter((b) => b.startOnLeft).map((b) => b.id)).toEqual(["ov-a", "ov-b"]);
  });
});

describe("ledgerBook", () => {
  const left = (i: number) => isLeftPage(i, true);

  it("lands every interview's overview on a left-hand page and closes on the back cover", () => {
    const flow = ledgerFlow([entry("a", { questions: [question("t1")] }), entry("b"), entry("c")]);
    const heights = flow.map((b) => ({ ...b, height: b.kind === "overview" ? 400 : 120 }));
    const pages = ledgerBook(packPages(heights, { capacity: 450, gap: 14, firstPage: LEDGER_FLOW_START, isLeft: left }), false);
    for (const id of ["a", "b", "c"]) expect(left(pageOf(pages, `ov-${id}`))).toBe(true);
    expect(pages.length % 2).toBe(0);
    expect(pages.at(-1)?.kind).toBe("back");
    expect(pages[0].kind).toBe("cover");
  });

  it("is four pages when there is nothing to record", () => {
    expect(ledgerBook([], true).map((p) => p.kind)).toEqual(["cover", "bookplate", "empty", "back"]);
  });

  it("opens deep links at an interview or a section", () => {
    const flow = ledgerFlow([entry("a"), entry("b")]);
    const pages = ledgerBook(
      packPages(flow.map((b) => ({ ...b, height: 100 })), { capacity: 450, gap: 14, firstPage: LEDGER_FLOW_START, isLeft: left }),
      false,
    );
    expect(ledgerStartPage(pages, { entry: "b" })).toBe(pageOf(pages, "ov-b"));
    expect(ledgerStartPage(pages, { entry: "gone", section: "trends" })).toBe(3);
    expect(ledgerStartPage(pages, { section: "history" })).toBe(1);
    expect(ledgerStartPage(pages, {})).toBeNull();
    expect(ledgerStartPage(ledgerBook([], true), { section: "summary" })).toBe(1);
  });
});

describe("describeLedger", () => {
  it("numbers printed pages only", () => {
    expect(describeLedger({ spread: [0], total: 12 })).toBe("Front cover");
    expect(describeLedger({ spread: [3, 4], total: 12 })).toBe("Pages 3–4 of 10");
    expect(describeLedger({ spread: [7], total: 12 })).toBe("Page 7 of 10");
    expect(describeLedger({ spread: [11], total: 12 })).toBe("Back cover");
  });
});
