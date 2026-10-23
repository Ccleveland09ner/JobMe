/**
 * A report as the reports folder files it, the folder's index of reports,
 * and how a report is laid out on the folder's sheets. Read the same way on
 * the server (the report first opened) and in the browser (another tab),
 * through RLS; the shaping and the layout are pure.
 */

import type { RowReader } from "@/lib/supabase/reader";

import type { ReportBody } from "../interview/report";
import { purposeFor } from "../engine/topics";
import type { AnyDimension, InterviewMode, StoredScores, TopicId } from "../engine/types";
import {
  groupIntoQuestions,
  questionRef,
  rankDimensions,
  reportFromRow,
  rollupQuestions,
  type FeedbackItem,
  type ReportRow,
  type ReportStats,
} from "../stats";
import {
  findEvidence,
  modeFromRow,
  pickOverall,
  pickScores,
  reportTurnFromRow,
  SESSION_JSON_COLUMNS,
  type TurnRow,
} from "./adapters";
import { topicLabel } from "./labels";
import { parsePlan } from "../plan";
import type { QuestionPlan } from "../schemas";
import { splitText, type FlowBlock, type PagePlan } from "./paginate";
import type { ReportQuestionView, ReportTurnView, SessionStatus } from "./types";

const SESSION_COLUMNS = `id, status, overall_scores, started_at, ${SESSION_JSON_COLUMNS}`;
const TURN_COLUMNS =
  "id, seq, topic, question_type, question_source, question_text, answer_transcript, scores, band, primary_gap, evidence, notepad_text, reason_text";

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

/** One original question, with the follow-ups that added to it. */
export type ReportQuestion = ReportQuestionView<ReportTurn>;

export interface ReportDocument {
  id: string;
  status: SessionStatus;
  startedAt: string;
  mode: InterviewMode | null;
  /** The job the interview was for, when one was given. */
  title: string | null;
  /** The headline 1-4 score as stored: the mean of the question scores. Null when unscored. */
  overall: number | null;
  overallScores: StoredScores | null;
  turns: ReportTurn[];
  /**
   * The turns by original question, grouped as the report pipeline grouped
   * them, so "Q2" in the feedback is Q2 here. A question's score is its
   * latest cumulative evaluation, so what a follow-up added counts toward it.
   */
  questions: ReportQuestion[];
  /** Null until the report has been written. */
  report: FiledReport | null;
}

export interface ReportTab {
  id: string;
  startedAt: string;
  mode: InterviewMode | null;
  title: string | null;
}

interface SessionRow {
  id: string;
  status: string;
  overall_scores: unknown;
  started_at: string;
  mode?: string | null;
  role_title?: string | null;
  /** Read for a document only: it says what each question assessed. */
  question_plan?: unknown;
}

/** Numbered Q1, Q2… with the competency and what it assessed for this job. */
export function questionsOf(turns: ReportTurn[], plan: QuestionPlan | null): ReportQuestion[] {
  return groupIntoQuestions(turns).map((g, i) => ({
    ...g,
    ref: questionRef(i),
    label: topicLabel(g.opening.topic),
    purpose: g.opening.topic ? purposeFor(plan, g.opening.topic as TopicId) : "",
  }));
}

export function reportDocumentFromRows(
  session: SessionRow,
  turns: (TurnRow & { id: string })[],
  report: ReportRow | null,
): ReportDocument {
  const ordered = [...turns]
    .sort((a, b) => a.seq - b.seq)
    .map((t) => ({ ...reportTurnFromRow(t), note: t.notepad_text?.trim() || null, reason: t.reason_text?.trim() || null }));
  // A malformed plan only costs each purpose its wording for this job.
  const questions = questionsOf(ordered, parsePlan(session.question_plan));
  return {
    id: session.id,
    status: session.status === "completed" ? "completed" : "in_progress",
    startedAt: session.started_at,
    mode: modeFromRow(session.mode),
    title: session.role_title?.trim() || null,
    overall: pickOverall(session.overall_scores) ?? rollupQuestions(questions).overall,
    overallScores: pickScores(session.overall_scores),
    turns: ordered,
    questions,
    report: report && reportFromRow(report),
  };
}

/** One interview's report, or null when there is no such interview. */
export async function loadReportDocument(supabase: RowReader, id: string): Promise<ReportDocument | null> {
  const [sessionRes, turnsRes, reportRes] = await Promise.all([
    supabase.from("interview_sessions").select(`${SESSION_COLUMNS}, question_plan`).eq("id", id).maybeSingle(),
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
    mode: modeFromRow(r.mode),
    title: r.role_title?.trim() || null,
  }));
}

/** The folder's tabs: finished interviews, newest first. */
export async function loadReportIndex(supabase: RowReader): Promise<ReportTab[]> {
  const { data, error } = await supabase
    .from("interview_sessions")
    .select(SESSION_COLUMNS)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(REPORT_INDEX_LIMIT);
  if (error) throw new Error(`report index: ${error.message}`);
  return reportTabsFromRows((data ?? []) as unknown as SessionRow[]);
}

/** The newest finished interview, which the bare reports folder opens at; null when there is none. */
export async function latestFiledReportId(supabase: RowReader): Promise<string | null> {
  const { data, error } = await supabase
    .from("interview_sessions")
    .select("id")
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`reports: ${error.message}`);
  return (data as { id: string } | null)?.id ?? null;
}

/** The tab for a document, for one the index doesn't list (an unfinished one). */
export function tabFor(doc: ReportDocument): ReportTab {
  return { id: doc.id, startedAt: doc.startedAt, mode: doc.mode, title: doc.title };
}

/** What POST /api/sessions/[id]/report returns. */
export type GeneratedReport = ReportBody;

/** The document once its report has been written; the session is then complete. */
export function withGeneratedReport(doc: ReportDocument, body: GeneratedReport): ReportDocument {
  return {
    ...doc,
    status: "completed",
    overall: pickOverall(body.overallScores) ?? doc.overall,
    overallScores: pickScores(body.overallScores),
    report: { summary: body.summary, weakestTurnId: body.weakestTurnId, rewrite: body.rewrite, stats: body.stats },
  };
}

export const isFiled = (doc: ReportDocument) => doc.status === "completed" && doc.report !== null;

/** The question the rewrite is for: the one holding the weakest answer. */
export function weakestQuestion(doc: ReportDocument): ReportQuestion | null {
  const id = doc.report?.weakestTurnId;
  return (id && doc.questions.find((q) => q.turns.some((t) => t.id === id))) || null;
}

/** Original questions asked, and how many of them were scored. */
export function questionCounts(doc: ReportDocument): { answered: number; scored: number } {
  return { answered: doc.questions.length, scored: doc.questions.filter((q) => q.score !== null).length };
}

/** The two strongest and two weakest averages, ranked as the fallback report ranks them. */
export function strengths(scores: StoredScores | null): { strongest: [AnyDimension, number][]; weakest: [AnyDimension, number][] } {
  const { best, worst } = rankDimensions(scores ?? {});
  if (best.length < 2) return { strongest: best, weakest: [] };
  const n = Math.min(2, Math.floor(best.length / 2));
  const strongest = best.slice(0, n);
  return { strongest, weakest: worst.filter(([d]) => !strongest.some(([s]) => s === d)).slice(0, n) };
}

// The sheets

export const FOLDER_SECTIONS = [
  { id: "summary", title: "Summary" },
  { id: "feedback", title: "Feedback" },
  { id: "rewrite", title: "Your weakest answer, rewritten" },
  { id: "questions", title: "Question by question" },
  { id: "transcript", title: "Transcript" },
] as const;

export type FolderSection = (typeof FOLDER_SECTIONS)[number]["id"];

export const FEEDBACK_LISTS = ["strengths", "improvements"] as const;
export type FeedbackListId = (typeof FEEDBACK_LISTS)[number];

/** One list of a report's feedback. Stats are stored JSON: a list the row lacks has no items. */
export function feedbackItems(doc: ReportDocument, list: FeedbackListId): FeedbackItem[] {
  const items = doc.report?.stats?.feedback?.[list];
  return Array.isArray(items) ? items : [];
}

/** Pieces of long text: summaries, rewrites and answers run on across sheets. */
export const FOLDER_TEXT_CHARS = 600;
/** Questions on one block of the competency list. */
export const FOLDER_COMPETENCY_ROWS = 6;

export type FolderBlockKind =
  | FolderSection
  | "summary-text"
  | "competencies"
  | "averages"
  | "dimension-key"
  | "strengths"
  | "speaking"
  | "feedback-none"
  | "feedback-list"
  | "feedback-item"
  | "rewrite-question"
  | "rewrite-said"
  | "rewrite-text"
  | "rewrite-missing"
  | "rewrite-none"
  | "question-scores"
  | "turn-notes"
  | "turn-question"
  | "turn-answer"
  | "turn-evidence";

/** One printed block of a report, before it is measured. */
export interface FolderBlock extends Omit<FlowBlock, "height"> {
  kind: FolderBlockKind;
  /** The question it is about: its index in the document's questions. */
  question?: number;
  /** The turn it is about: its index in the document's turns. */
  turn?: number;
  /** A piece of a longer text, and whether it is the first piece. */
  text?: string;
  first?: boolean;
  /** "competencies": the questions it lists, [from, to). */
  range?: [number, number];
  /** "feedback-list" and "feedback-item": which list, and the item in it. */
  list?: FeedbackListId;
  item?: number;
  /** "turn-evidence": the quote is in no single piece of the answer, so it is shown here. */
  quote?: boolean;
}

const hasNotes = (t: ReportTurn) => Boolean(t.evidence || t.note || t.reason);

/** A report's blocks, section by section, each section on a fresh sheet. */
export function folderFlow(doc: ReportDocument): FolderBlock[] {
  if (!isFiled(doc) || !doc.report) return [];
  const { report, questions } = doc;
  const blocks: FolderBlock[] = [];
  const section = (id: FolderSection) => blocks.push({ id, kind: id, breakBefore: true, keepWithNext: true });
  const pieces = (text: string) => splitText(text, FOLDER_TEXT_CHARS);
  const at = new Map(doc.turns.map((t, i) => [t.id, i]));

  section("summary");
  pieces(report.summary).forEach((text, k) => blocks.push({ id: `summary-${k}`, kind: "summary-text", text }));
  if (questions.some((q) => q.score !== null)) {
    for (let from = 0; from < questions.length; from += FOLDER_COMPETENCY_ROWS)
      blocks.push({
        id: `competencies-${from}`,
        kind: "competencies",
        range: [from, Math.min(questions.length, from + FOLDER_COMPETENCY_ROWS)],
      });
  }
  blocks.push({ id: "averages", kind: "averages" }, { id: "dimension-key", kind: "dimension-key" });
  if (doc.overallScores) blocks.push({ id: "strengths", kind: "strengths" });
  blocks.push({ id: "speaking", kind: "speaking" });

  section("feedback");
  // Reports written before feedback existed say so rather than lose the section.
  if (!report.stats?.feedback) blocks.push({ id: "feedback-none", kind: "feedback-none" });
  else
    for (const list of FEEDBACK_LISTS) {
      const items = feedbackItems(doc, list);
      blocks.push({ id: `fl-${list}`, kind: "feedback-list", list, keepWithNext: items.length > 0 });
      items.forEach((_, item) => blocks.push({ id: `fi-${list}-${item}`, kind: "feedback-item", list, item }));
    }

  section("rewrite");
  const weakest = weakestQuestion(doc);
  if (!weakest) blocks.push({ id: "rewrite-none", kind: "rewrite-none" });
  else {
    const question = questions.indexOf(weakest);
    blocks.push({ id: "rewrite-question", kind: "rewrite-question", question, keepWithNext: true });
    // What was said to it, follow-ups included, then the rewrite.
    weakest.turns.forEach((t) => {
      const said = pieces(t.answer);
      (said.length ? said : [""]).forEach((text, k) =>
        blocks.push({ id: `said-${t.id}-${k}`, kind: "rewrite-said", question, turn: at.get(t.id), text, first: k === 0 }),
      );
    });
    if (report.rewrite)
      pieces(report.rewrite).forEach((text, k) => blocks.push({ id: `rewrite-${k}`, kind: "rewrite-text", text, first: k === 0 }));
    else blocks.push({ id: "rewrite-missing", kind: "rewrite-missing" });
  }

  if (questions.length) {
    section("questions");
    questions.forEach((q, question) => {
      const noted = q.turns.filter(hasNotes);
      blocks.push({ id: `qs-${q.opening.id}`, kind: "question-scores", question, keepWithNext: noted.length > 0 });
      noted.forEach((t) => blocks.push({ id: `fn-${t.id}`, kind: "turn-notes", question, turn: at.get(t.id) }));
    });

    section("transcript");
    questions.forEach((q, question) =>
      q.turns.forEach((t) => {
        const turn = at.get(t.id);
        blocks.push({ id: `tq-${t.id}`, kind: "turn-question", question, turn, keepWithNext: true });
        const answer = pieces(t.answer);
        (answer.length ? answer : [""]).forEach((text, k) =>
          blocks.push({ id: `ta-${t.id}-${k}`, kind: "turn-answer", question, turn, text, first: k === 0 }),
        );
        // A quote that isn't in any one piece is shown beneath, never dropped.
        const quote = Boolean(t.evidence) && !answer.some((p) => findEvidence(p, t.evidence));
        if (quote || !t.scores) blocks.push({ id: `te-${t.id}`, kind: "turn-evidence", question, turn, quote });
      }),
    );
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

/** Where a report is read: the folder, opened at it. */
export const reportPath = (id: string) => `/interview/${id}/report`;

/** The report a path names; null for any other path (the bare /reports, say). */
export function reportIdIn(pathname: string): string | null {
  return pathname.match(/^\/interview\/([^/]+)\/report\/?$/)?.[1] ?? null;
}

/** "Pages 4–5 of 17", counting the report's sheets: the flap carries no number. */
export function describeFolder({ spread, total }: { spread: number[]; total: number }): string {
  const printed = spread.filter((i) => i > 0);
  const of = total - 1;
  if (!printed.length) return `Inside the flap, ${of} ${of === 1 ? "page" : "pages"}`;
  return printed.length === 2 ? `Pages ${printed[0]}–${printed[1]} of ${of}` : `Page ${printed[0]} of ${of}`;
}
