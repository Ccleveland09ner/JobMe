/**
 * The ledger (pure): each interview in a volume, shaped from its session,
 * turn and report rows, and the book they are printed in. Long text is cut
 * here, on the server, so only what the ledger shows reaches the page and
 * no single entry is taller than a page.
 */

import type { ReportStats } from "@/lib/ai/report";

import { reportTurnFromRow, sessionSummaryFromRow, type SessionRowData, type TurnRow } from "./adapters";
import { splitText, type FlowBlock, type PagePlan } from "./paginate";
import type { ReportTurnView, SessionSummary } from "./types";

/** How much of an answer the ledger shows; the full answer is in the report. */
export const LEDGER_ANSWER_CHARS = 220;
/** Questions and notes are short; this only guards against a runaway one. */
export const LEDGER_LINE_CHARS = 320;
/** The interviewer's summary runs on in pieces of this size. */
export const LEDGER_SUMMARY_CHARS = 420;

export interface LedgerQuestion extends ReportTurnView {
  /** The interviewer's note on the answer. */
  note: string | null;
}

export interface LedgerEntry extends SessionSummary {
  /** The job the interview was for, when one was given. */
  title: string | null;
  questions: LedgerQuestion[];
  /** The interviewer's summary, once the report exists. */
  summary: string | null;
  wpm: number | null;
  fillers: number | null;
}

export interface LedgerSessionRow extends SessionRowData {
  /** `question_plan->role->>title`. */
  role_title?: string | null;
}

export interface LedgerTurnRow extends TurnRow {
  id: string;
  session_id: string;
}

export interface LedgerReportRow {
  session_id: string;
  summary: string | null;
  stats: Partial<ReportStats> | null;
}

/** The start of `text`, cut at a word and marked with an ellipsis when cut. */
export function excerpt(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

export function ledgerEntries(sessions: LedgerSessionRow[], turns: LedgerTurnRow[], reports: LedgerReportRow[]): LedgerEntry[] {
  const turnsBySession = new Map<string, LedgerTurnRow[]>();
  for (const t of turns) turnsBySession.set(t.session_id, [...(turnsBySession.get(t.session_id) ?? []), t]);
  const reportBySession = new Map(reports.map((r) => [r.session_id, r]));

  return sessions.map((s) => {
    const report = reportBySession.get(s.id);
    const questions = [...(turnsBySession.get(s.id) ?? [])]
      .sort((a, b) => a.seq - b.seq)
      .map((t) => ({
        ...reportTurnFromRow(t),
        questionText: excerpt(t.question_text ?? "", LEDGER_LINE_CHARS),
        answer: excerpt(t.answer_transcript ?? "", LEDGER_ANSWER_CHARS),
        note: excerpt(t.notepad_text ?? "", LEDGER_LINE_CHARS) || null,
      }));
    return {
      ...sessionSummaryFromRow(s),
      title: s.role_title?.trim() || null,
      questions,
      summary: report?.summary?.trim() || null,
      wpm: report?.stats?.wpm ?? null,
      fillers: report?.stats?.fillers ?? null,
    };
  });
}

// The book

/** A volume of the ledger, open at its contents. Volume 1 holds the newest interviews. */
export function ledgerVolumeHref(volume: number): string {
  return `/dashboard?open=ledger&section=history${volume === 1 ? "" : `&page=${volume}`}`;
}

/**
 * Pages before the interviews: the front cover, then bookplate | contents
 * and progress | trends. The first interview starts on a left-hand page.
 */
export const LEDGER_FLOW_START = 5;
export const LEDGER_CONTENTS_PAGE = 2;
export const LEDGER_PROGRESS_PAGE = 3;

export type LedgerBlockKind = "overview" | "summary" | "metrics" | "questions" | "question" | "pending";

/** One printed block of an interview's record, before it is measured. */
export interface LedgerBlock extends Omit<FlowBlock, "height"> {
  kind: LedgerBlockKind;
  /** The entry's index in the volume. */
  entry: number;
  /** "question": the question's index in the entry. */
  question?: number;
  /** "summary": this piece of it, and whether it is the first. */
  text?: string;
  first?: boolean;
}

/**
 * Each interview's blocks: its overview alone on a left-hand page, then its
 * details from the facing page on: the interviewer's summary, the speaking
 * figures, and every question with its answer and note.
 */
export function ledgerFlow(entries: LedgerEntry[]): LedgerBlock[] {
  return entries.flatMap((e, entry) => {
    const details: LedgerBlock[] = [];
    if (e.summary) {
      splitText(e.summary, LEDGER_SUMMARY_CHARS).forEach((text, k) =>
        details.push({ id: `s-${e.id}-${k}`, kind: "summary", entry, text, first: k === 0 }),
      );
    }
    if (e.wpm !== null || e.fillers !== null) details.push({ id: `m-${e.id}`, kind: "metrics", entry });
    if (e.questions.length) {
      details.push({ id: `qh-${e.id}`, kind: "questions", entry, keepWithNext: true });
      e.questions.forEach((q, question) => details.push({ id: `q-${q.id}`, kind: "question", entry, question }));
    }
    if (!details.length) details.push({ id: `p-${e.id}`, kind: "pending", entry });
    details[0] = { ...details[0], breakBefore: true };
    return [{ id: `ov-${e.id}`, kind: "overview" as const, entry, startOnLeft: true }, ...details];
  });
}

export type LedgerPage =
  | { kind: "cover" | "bookplate" | "contents" | "progress" | "trends" | "notes" | "end" | "empty" | "back" }
  | { kind: "flow"; ids: string[] };

/**
 * The whole volume around its packed interview pages (packed from
 * LEDGER_FLOW_START). The back cover closes the book alone on the left, so it
 * takes an odd index and the page count is even.
 */
export function ledgerBook(flow: PagePlan[], empty: boolean): LedgerPage[] {
  const pages: LedgerPage[] = empty
    ? [{ kind: "cover" }, { kind: "bookplate" }, { kind: "empty" }]
    : [
        { kind: "cover" },
        { kind: "bookplate" },
        { kind: "contents" },
        { kind: "progress" },
        { kind: "trends" },
        ...flow.map((p): LedgerPage => (p.kind === "blank" ? { kind: "notes" } : { kind: "flow", ids: p.ids })),
        { kind: "end" },
      ];
  if (pages.length % 2 === 0) pages.push({ kind: "notes" });
  pages.push({ kind: "back" });
  return pages;
}

/** The page a block was printed on, or -1. */
export function pageOf(pages: LedgerPage[], blockId: string): number {
  return pages.findIndex((p) => p.kind === "flow" && p.ids.includes(blockId));
}

/** Where a deep link opens the book: an interview's overview, or a section. */
export function ledgerStartPage(pages: LedgerPage[], link: { entry?: string; section?: string }): number | null {
  if (link.entry) {
    const at = pageOf(pages, `ov-${link.entry}`);
    if (at >= 0) return at;
  }
  if (link.section === "summary" || link.section === "trends") return pages[LEDGER_PROGRESS_PAGE]?.kind === "progress" ? LEDGER_PROGRESS_PAGE : 1;
  if (link.section === "history") return 1;
  return null;
}

/** "Pages 6–7 of 20", counting printed pages only: the covers carry no number. */
export function describeLedger({ spread, total }: { spread: number[]; total: number }): string {
  if (spread.length === 1 && spread[0] === 0) return "Front cover";
  if (spread.length === 1 && spread[0] === total - 1) return "Back cover";
  const printed = spread.filter((i) => i > 0 && i < total - 1);
  const of = total - 2;
  return printed.length === 2 ? `Pages ${printed[0]}–${printed[1]} of ${of}` : `Page ${printed[0]} of ${of}`;
}
