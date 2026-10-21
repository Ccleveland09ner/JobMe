/**
 * A report as the reports folder files it, the folder's index of reports,
 * and how a report is laid out on the folder's sheets. Read the same way on
 * the server (the report first opened) and in the browser (another tab),
 * through RLS; the shaping and the layout are pure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ReportStats } from "@/lib/ai/report";

import type { Dimension, InterviewMode, Scores } from "../engine/types";
import { displayAverage, findEvidence, pickScores, reportTurnFromRow, scoreEntries, type TurnRow } from "./adapters";
import { splitText, type FlowBlock, type PagePlan } from "./paginate";
import type { ReportTurnView, SessionStatus } from "./types";

const SESSION_COLUMNS =
  "id, status, overall_scores, started_at, mode:engine_state->>mode, role_title:question_plan->role->>title";
const TURN_COLUMNS =
  "id, seq, topic, question_type, question_source, question_text, answer_transcript, scores, band, primary_gap, evidence, notepad_text, reason_text, wpm, filler_count";

/** Reports the folder keeps a tab for, newest first. */
export const REPORT_INDEX_LIMIT = 60;

export interface FiledReport {
  summary: string;
  weakestTurnId: string | null;
  rewrite: string | null;
  stats: ReportStats | null;
}

export interface ReportTurn extends ReportTurnView {
  note: string | null;
  reason: string | null;
}

export interface ReportDocument {
  id: string;
  status: SessionStatus;
  startedAt: string;
  mode: InterviewMode | null;
  /** The job the interview was for, when one was given. */
  title: string | null;
  overallScores: Partial<Scores> | null;
  turns: ReportTurn[];
  /** Null until the report has been written. */
  report: FiledReport | null;
}

export interface ReportTab {
  id: string;
  startedAt: string;
  mode: InterviewMode | null;
  title: string | null;
  average: number | null;
}

interface SessionRow {
  id: string;
  status: string;
  overall_scores: unknown;
  started_at: string;
  mode?: string | null;
  role_title?: string | null;
}

interface ReportRow {
  summary: string | null;
  weakest_turn_id: string | null;
  rewrite_text: string | null;
  stats: ReportStats | null;
}

type Reader = Pick<SupabaseClient, "from">;

const modeOf = (mode: string | null | undefined): InterviewMode | null =>
  mode === "quick" || mode === "full" ? mode : null;

export function reportDocumentFromRows(
  session: SessionRow,
  turns: (TurnRow & { id: string })[],
  report: ReportRow | null,
): ReportDocument {
  return {
    id: session.id,
    status: session.status === "completed" ? "completed" : "in_progress",
    startedAt: session.started_at,
    mode: modeOf(session.mode),
    title: session.role_title?.trim() || null,
    overallScores: pickScores(session.overall_scores),
    turns: [...turns]
      .sort((a, b) => a.seq - b.seq)
      .map((t) => ({ ...reportTurnFromRow(t), note: t.notepad_text?.trim() || null, reason: t.reason_text?.trim() || null })),
    report: report && {
      summary: report.summary ?? "",
      weakestTurnId: report.weakest_turn_id,
      rewrite: report.rewrite_text,
      stats: report.stats,
    },
  };
}

/** One interview's report, or null when there is no such interview. */
export async function loadReportDocument(supabase: Reader, id: string): Promise<ReportDocument | null> {
  const [sessionRes, turnsRes, reportRes] = await Promise.all([
    supabase.from("interview_sessions").select(SESSION_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("turns").select(TURN_COLUMNS).eq("session_id", id).order("seq", { ascending: true }),
    supabase.from("reports").select("summary, weakest_turn_id, rewrite_text, stats").eq("session_id", id).maybeSingle(),
  ]);
  if (sessionRes.error) throw new Error(`report session: ${sessionRes.error.message}`);
  if (turnsRes.error) throw new Error(`report turns: ${turnsRes.error.message}`);
  if (reportRes.error) throw new Error(`report row: ${reportRes.error.message}`);
  if (!sessionRes.data) return null;
  return reportDocumentFromRows(
    sessionRes.data as unknown as SessionRow,
    (turnsRes.data ?? []) as unknown as (TurnRow & { id: string })[],
    reportRes.data as unknown as ReportRow | null,
  );
}

export function reportTabsFromRows(rows: SessionRow[]): ReportTab[] {
  return rows.map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    mode: modeOf(r.mode),
    title: r.role_title?.trim() || null,
    average: displayAverage(pickScores(r.overall_scores)),
  }));
}

/** The folder's tabs: finished interviews, newest first. */
export async function loadReportIndex(supabase: Reader): Promise<ReportTab[]> {
  const { data, error } = await supabase
    .from("interview_sessions")
    .select(SESSION_COLUMNS)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(REPORT_INDEX_LIMIT);
  if (error) throw new Error(`report index: ${error.message}`);
  return reportTabsFromRows((data ?? []) as unknown as SessionRow[]);
}

/** The tab for a document, for one the index doesn't list (an unfinished one). */
export function tabFor(doc: ReportDocument): ReportTab {
  return { id: doc.id, startedAt: doc.startedAt, mode: doc.mode, title: doc.title, average: displayAverage(doc.overallScores) };
}

/** What POST /api/sessions/[id]/report returns (lib/interview/report.ts ReportBody). */
export interface GeneratedReport {
  summary: string;
  weakestTurnId: string | null;
  rewrite: string | null;
  stats: ReportStats;
  overallScores: Record<string, number> | null;
}

/** The document once its report has been written; the session is then complete. */
export function withGeneratedReport(doc: ReportDocument, body: GeneratedReport): ReportDocument {
  return {
    ...doc,
    status: "completed",
    overallScores: pickScores(body.overallScores),
    report: { summary: body.summary, weakestTurnId: body.weakestTurnId, rewrite: body.rewrite, stats: body.stats },
  };
}

export const isFiled = (doc: ReportDocument) => doc.status === "completed" && doc.report !== null;

/** The two strongest and two weakest averages. */
export function strengths(scores: Partial<Scores> | null): { strongest: [Dimension, number][]; weakest: [Dimension, number][] } {
  const ranked = scoreEntries(scores ?? {}).sort((a, b) => b[1] - a[1]);
  if (ranked.length < 2) return { strongest: ranked, weakest: [] };
  const n = Math.min(2, Math.floor(ranked.length / 2));
  return { strongest: ranked.slice(0, n), weakest: ranked.slice(-n).reverse() };
}

// The sheets

export const FOLDER_SECTIONS = [
  { id: "summary", title: "Summary" },
  { id: "performance", title: "Performance" },
  { id: "feedback", title: "Question by question" },
  { id: "rewrite", title: "Your weakest answer, rewritten" },
  { id: "transcript", title: "Transcript" },
] as const;

export type FolderSection = (typeof FOLDER_SECTIONS)[number]["id"];

/** Pieces of long text: summaries, rewrites and answers run on across sheets. */
export const FOLDER_TEXT_CHARS = 600;
/** Rows of the band list on one block. */
export const FOLDER_BAND_ROWS = 10;

export type FolderBlockKind =
  | FolderSection
  | "summary-text"
  | "averages"
  | "strengths"
  | "speaking"
  | "bands"
  | "turn-feedback"
  | "turn-notes"
  | "rewrite-text"
  | "turn-question"
  | "turn-answer"
  | "turn-evidence";

/** One printed block of a report, before it is measured. */
export interface FolderBlock extends Omit<FlowBlock, "height"> {
  kind: FolderBlockKind;
  /** The turn it is about: its index in the document. */
  turn?: number;
  /** A piece of a longer text. */
  text?: string;
  /** "bands": the turns it lists, [from, to). */
  range?: [number, number];
}

/** A report's blocks, section by section, each section on a fresh sheet. */
export function folderFlow(doc: ReportDocument): FolderBlock[] {
  if (!isFiled(doc) || !doc.report) return [];
  const { report, turns } = doc;
  const blocks: FolderBlock[] = [];
  const section = (id: FolderSection) => blocks.push({ id, kind: id, breakBefore: true, keepWithNext: true });
  const pieces = (text: string) => splitText(text, FOLDER_TEXT_CHARS);

  section("summary");
  pieces(report.summary).forEach((text, k) => blocks.push({ id: `summary-${k}`, kind: "summary-text", text }));
  blocks.push({ id: "averages", kind: "averages" });

  section("performance");
  if (doc.overallScores) blocks.push({ id: "strengths", kind: "strengths" });
  blocks.push({ id: "speaking", kind: "speaking" });
  for (let from = 0; from < turns.length; from += FOLDER_BAND_ROWS)
    blocks.push({ id: `bands-${from}`, kind: "bands", range: [from, Math.min(turns.length, from + FOLDER_BAND_ROWS)] });

  if (turns.length) {
    section("feedback");
    turns.forEach((t, turn) => {
      const notes = Boolean(t.evidence || t.note || t.reason);
      blocks.push({ id: `fq-${t.id}`, kind: "turn-feedback", turn, keepWithNext: notes });
      if (notes) blocks.push({ id: `fn-${t.id}`, kind: "turn-notes", turn });
    });
  }

  if (report.weakestTurnId || report.rewrite) {
    section("rewrite");
    if (report.rewrite) pieces(report.rewrite).forEach((text, k) => blocks.push({ id: `rewrite-${k}`, kind: "rewrite-text", text }));
  }

  if (turns.length) {
    section("transcript");
    turns.forEach((t, turn) => {
      blocks.push({ id: `tq-${t.id}`, kind: "turn-question", turn, keepWithNext: true });
      const answer = pieces(t.answer);
      (answer.length ? answer : [""]).forEach((text, k) => blocks.push({ id: `ta-${t.id}-${k}`, kind: "turn-answer", turn, text }));
      // A quote that isn't in any one piece is shown beneath, never dropped.
      if (t.evidence && !answer.some((p) => findEvidence(p, t.evidence))) blocks.push({ id: `te-${t.id}`, kind: "turn-evidence", turn });
    });
  }
  return blocks;
}

export type FolderPage = { kind: "flap" | "generate" | "empty" | "blank" } | { kind: "flow"; ids: string[] };

/** Report sheets start on the page facing the folder's flap. */
export const FOLDER_FLOW_START = 1;

/**
 * The folder's pages: its inside flap, then the report's sheets (or, until
 * the report is written, the sheet that writes it), to an even count.
 */
export function folderBook(doc: ReportDocument | null, flow: PagePlan[]): FolderPage[] {
  const pages: FolderPage[] = !doc
    ? [{ kind: "flap" }, { kind: "empty" }]
    : !isFiled(doc)
      ? [{ kind: "flap" }, { kind: "generate" }]
      : [{ kind: "flap" }, ...flow.map((p): FolderPage => (p.kind === "blank" ? { kind: "blank" } : { kind: "flow", ids: p.ids }))];
  if (pages.length % 2) pages.push({ kind: "blank" });
  return pages;
}

/** Where each section starts, for the flap's contents. */
export function sectionStarts(pages: FolderPage[]): { id: FolderSection; title: string; page: number }[] {
  return FOLDER_SECTIONS.flatMap((s) => {
    const page = pages.findIndex((p) => p.kind === "flow" && p.ids.includes(s.id));
    return page < 0 ? [] : [{ id: s.id, title: s.title, page }];
  });
}

/** "Pages 4–5 of 17", counting the report's sheets: the flap carries no number. */
export function describeFolder({ spread, total }: { spread: number[]; total: number }): string {
  const printed = spread.filter((i) => i > 0);
  const of = total - 1;
  if (!printed.length) return `Inside the flap, ${of} ${of === 1 ? "page" : "pages"}`;
  return printed.length === 2 ? `Pages ${printed[0]}–${printed[1]} of ${of}` : `Page ${printed[0]} of ${of}`;
}
