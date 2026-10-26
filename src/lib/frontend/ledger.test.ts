import { describe, expect, it } from "vitest";

import { fakeSupabase } from "@/lib/testing/fake-supabase";

import { isLeftPage } from "./book-layout";
import { topicLabel } from "./labels";
import {
  answeredBy,
  describeLedger,
  LEDGER_FLOW_START,
  LEDGER_TEXT_CHARS,
  ledgerBook,
  ledgerEntries,
  ledgerEntryHref,
  ledgerFlow,
  ledgerStartPage,
  loadEntryVolume,
  loadLedgerShelf,
  loadLedgerVolume,
  pageOf,
  VOLUME_SIZE,
  type LedgerEntry,
  type LedgerSessionRow,
  type LedgerTurnRow,
} from "./ledger";
import { packPages } from "./paginate";

const session: LedgerSessionRow = {
  id: "s1",
  status: "completed",
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
  question_source: "bank",
  question_text: `Question ${seq}`,
  answer_transcript: "We shipped it on time.",
  capture_ms: null,
  ...extra,
});

describe("answeredBy", () => {
  it("says whether an answer was typed, or spoken and for how long", () => {
    expect(answeredBy(null)).toBe("Typed");
    expect(answeredBy(0)).toBe("Spoken");
    expect(answeredBy(48_200)).toBe("Spoken for 48 s");
    expect(answeredBy(72_000)).toBe("Spoken for 1 min 12 s");
    expect(answeredBy(120_400)).toBe("Spoken for 2 min");
  });
});

describe("ledgerEntries", () => {
  it("threads each interview's turns by original question, numbered as the report numbers them", () => {
    const long = "word ".repeat(300);
    const [entry] = ledgerEntries(
      [session],
      [
        turn(3, { topic: "conflict", question_source: "resume" }),
        turn(2, { question_type: "clarify", question_text: "What changed?", capture_ms: 48_000 }),
        turn(1, { answer_transcript: long }),
      ],
    );
    expect(entry.title).toBe("Backend Intern");
    expect(entry.mode).toBe("quick");
    expect(entry.questions.map((q) => [q.ref, q.label, q.fromResume, q.turns.map((t) => t.seq)])).toEqual([
      ["Q1", topicLabel("teamwork"), false, [1, 2]],
      ["Q2", topicLabel("conflict"), true, [3]],
    ]);
    expect(entry.questions[0].turns[1]).toMatchObject({ questionType: "clarify", questionText: "What changed?", spokenMs: 48_000 });
    expect(entry.followUps).toBe(1);
    expect(entry.words).toBe(310);
  });

  it("keeps every word of an answer: the ledger is the transcript", () => {
    const long = "This answer goes on for a long while. ".repeat(60);
    const [entry] = ledgerEntries([session], [turn(1, { answer_transcript: long })]);
    expect(entry.questions[0].turns[0].answer).toBe(long.trim());
  });

  it("copes with an interview that has no turns yet, and with a question type it doesn't know", () => {
    const [empty] = ledgerEntries([{ ...session, id: "s2", status: "in_progress", role_title: null }], []);
    expect(empty).toMatchObject({ status: "in_progress", title: null, questions: [], followUps: 0, words: 0 });
    const [odd] = ledgerEntries([session], [turn(1, { question_type: "riddle" })]);
    expect(odd.questions[0].turns[0].questionType).toBeNull();
  });
});

const entry = (id: string, extra: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id,
  status: "completed",
  mode: "quick",
  startedAt: "2026-10-18T10:00:00Z",
  endedAt: null,
  title: null,
  questions: [],
  followUps: 0,
  words: 0,
  ...extra,
});

/** Questions shaped from turn rows, as an entry holds them. */
const questions = (rows: LedgerTurnRow[]) => ledgerEntries([session], rows)[0].questions;

describe("ledgerFlow", () => {
  it("puts the overview on a left page and the transcript from the facing one, ending at the way to the report", () => {
    const flow = ledgerFlow([entry("a", { questions: questions([turn(1), turn(2, { question_type: "deepen" })]) }), entry("b")]);
    expect(flow.filter((b) => b.entry === 0).map((b) => b.kind)).toEqual([
      "overview",
      "transcript",
      "ask",
      "answer",
      "ask",
      "answer",
      "where-next",
    ]);
    expect(flow.filter((b) => b.breakBefore).map((b) => b.id)).toEqual(["tr-a", "p-b"]);
    expect(flow.filter((b) => b.startOnLeft).map((b) => b.id)).toEqual(["ov-a", "ov-b"]);
    const asks = flow.filter((b) => b.kind === "ask");
    expect(asks.map((b) => [b.question, b.turn])).toEqual([
      [0, 0],
      [0, 1],
    ]);
    expect(asks.every((b) => b.keepWithNext)).toBe(true);
  });

  it("runs a long answer on in pieces, marking the first and the last", () => {
    const long = "This is one sentence of a long answer. ".repeat(40);
    const pieces = ledgerFlow([entry("a", { questions: questions([turn(1, { answer_transcript: long })]) })]).filter(
      (b) => b.kind === "answer",
    );
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((p) => (p.text ?? "").length <= LEDGER_TEXT_CHARS)).toBe(true);
    expect(pieces.map((p) => [p.first, p.last])).toEqual(pieces.map((_, k) => [k === 0, k === pieces.length - 1]));
    expect(pieces.map((p) => p.text).join(" ")).toBe(long.trim());
  });

  it("prints a turn with no answer as one empty piece", () => {
    const answers = ledgerFlow([entry("a", { questions: questions([turn(1, { answer_transcript: "" })]) })]).filter(
      (b) => b.kind === "answer",
    );
    expect(answers).toEqual([expect.objectContaining({ text: "", first: true, last: true })]);
  });
});

describe("ledgerBook", () => {
  const left = (i: number) => isLeftPage(i, true);

  it("lands every interview's overview on a left-hand page and closes on the back cover", () => {
    const flow = ledgerFlow([entry("a", { questions: questions([turn(1)]) }), entry("b"), entry("c")]);
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
    expect(ledgerEntryHref("b")).toBe("/dashboard?open=ledger&entry=b");
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

describe("loading", () => {
  it("reads the shelf: counts, the trend oldest first, and whose record it is", async () => {
    const shelf = loadLedgerShelf;
    const db = fakeSupabase((q) => {
      if (q.table === "profiles") return { data: { username: "kazu", member_code: "JM-1" } };
      if (q.filters.some(([, col]) => col === "status")) {
        return {
          count: 2,
          data: [
            { id: "c", started_at: "2026-10-20", overall_scores: { relevance: 3, outcome: 2, overall: 2.64 } },
            { id: "b", started_at: "2026-10-18", overall_scores: { task: 3 } },
            { id: "a", started_at: "2026-10-10", overall_scores: null },
          ],
        };
      }
      return { count: 5 };
    });
    expect(await shelf(db.client as never, "user-1")).toEqual({
      total: 5,
      completed: 2,
      trend: [
        { id: "a", startedAt: "2026-10-10", scores: null, overall: null },
        // Stored before `overall` existed: the plain mean stands in.
        { id: "b", startedAt: "2026-10-18", scores: { task: 3 }, overall: 3 },
        { id: "c", startedAt: "2026-10-20", scores: { relevance: 3, outcome: 2 }, overall: 2.6 },
      ],
      owner: { username: "kazu", memberCode: "JM-1" },
    });
  });

  it("does without the owner, but not without the counts", async () => {
    const shelf = loadLedgerShelf;
    const noProfile = fakeSupabase((q) => (q.table === "profiles" ? { error: { message: "rls" } } : { count: 0, data: [] }));
    expect((await shelf(noProfile.client as never, "user-1")).owner).toBeNull();
    const broken = fakeSupabase((q) => (q.table === "profiles" ? {} : { error: { message: "down" } }));
    await expect(shelf(broken.client as never, "user-1")).rejects.toThrow("dashboard count: down");
  });

  it("reads a volume with every turn of each interview, and nothing that judges them", async () => {
    const db = fakeSupabase((q) =>
      q.table === "interview_sessions" ? { data: [session] } : { data: [turn(1, { capture_ms: 30_000 })] },
    );
    const [read] = await loadLedgerVolume(db.client as never, [0, 5]);
    expect(read).toMatchObject({ id: "s1", title: "Backend Intern", followUps: 0, words: 5 });
    expect(read.questions[0].turns[0]).toMatchObject({ answer: "We shipped it on time.", spokenMs: 30_000 });
    const sessions = db.queries.find((q) => q.table === "interview_sessions");
    expect(sessions?.columns).toContain("role_title:question_plan->role->>title");
    expect(sessions?.columns).not.toContain("overall_scores");
    expect(sessions?.modifiers).toContain("range:0-5");
    const turns = db.queries.find((q) => q.table === "turns");
    expect(turns?.filters).toContainEqual(["in", "session_id", ["s1"]]);
    expect(turns?.columns).toContain("capture_ms");
    expect(turns?.columns).not.toMatch(/scores|band|notepad|evidence/);
    expect(db.queries.some((q) => q.table === "reports")).toBe(false);
  });

  it("asks nothing more for an empty volume, and fails loudly on a broken read", async () => {
    const empty = fakeSupabase(() => ({ data: [] }));
    expect(await loadLedgerVolume(empty.client as never, [0, 5])).toEqual([]);
    expect(empty.queries).toHaveLength(1);
    const broken = fakeSupabase((q) => (q.table === "turns" ? { error: { message: "down" } } : { data: [session] }));
    await expect(loadLedgerVolume(broken.client as never, [0, 5])).rejects.toThrow("dashboard turns: down");
  });
});

describe("loadEntryVolume", () => {
  /** An interview with `newer` interviews started after it. */
  const withNewer = (newer: number) =>
    fakeSupabase((q) => (q.single ? { data: { started_at: "2026-10-18T10:00:00Z" } } : { count: newer }));

  it("finds the volume from how many interviews are newer", async () => {
    expect(await loadEntryVolume(withNewer(0).client as never, "s1")).toBe(1);
    expect(await loadEntryVolume(withNewer(VOLUME_SIZE - 1).client as never, "s1")).toBe(1);
    expect(await loadEntryVolume(withNewer(VOLUME_SIZE).client as never, "s1")).toBe(2);
    const db = withNewer(3);
    await loadEntryVolume(db.client as never, "s1");
    expect(db.queries[0].filters).toContainEqual(["eq", "id", "s1"]);
    expect(db.queries[1].filters).toContainEqual(["gt", "started_at", "2026-10-18T10:00:00Z"]);
  });

  it("is null for an interview it can't see, and fails loudly on a broken read", async () => {
    expect(await loadEntryVolume(fakeSupabase(() => ({ data: null })).client as never, "gone")).toBeNull();
    const broken = fakeSupabase(() => ({ error: { message: "down" } }));
    await expect(loadEntryVolume(broken.client as never, "s1")).rejects.toThrow("ledger entry: down");
  });
});
