/**
 * The ledger (pure): the record of each interview in a volume, word for word,
 * shaped from its session and turn rows, and the book they are printed in.
 * It is an account of what happened, so it carries no scores, notes or
 * feedback: those are the report's, and every entry points there. Long
 * answers are split here, on the server, so no piece is taller than a page.
 */

import { FULL_QUESTION_CAP_MAX, QUESTION_TYPES, type InterviewMode, type QuestionType } from "@/lib/engine/types";
import { questionRef, questionThreads, wordCount } from "@/lib/stats";
import type { RowReader } from "@/lib/supabase/reader";

import { modeFromRow, oneOf, pickOverall, pickScores, SESSION_JSON_COLUMNS } from "./adapters";
import { topicLabel } from "./labels";
import { splitText, type FlowBlock, type PagePlan } from "./paginate";
import type { SessionStatus, TrendPoint } from "./types";

/** Interviews per volume of the ledger. */
export const VOLUME_SIZE = 6;

/** Completed interviews plotted on the trend chart, most recent. */
export const TREND_LIMIT = 20;

/** An answer runs on across pages in pieces of this size. */
export const LEDGER_TEXT_CHARS = 600;

/** One exchange: what the interviewer asked, and the answer given, in full. */
export interface LedgerTurn {
  id: string;
  seq: number;
  /** An opening, or the follow-up it was (clarify or deepen). */
  questionType: QuestionType | null;
  questionText: string;
  answer: string;
  /** How long the answer was spoken for, ms; null when it was typed. */
  spokenMs: number | null;
}

/** One original question: its opening exchange, then each follow-up that added to it. */
export interface LedgerQuestion {
  /** "Q2", numbered as the report numbers it. */
  ref: string;
  /** The competency it was about. */
  label: string;
  fromResume: boolean;
  turns: LedgerTurn[];
}

export interface LedgerEntry {
  id: string;
  status: SessionStatus;
  mode: InterviewMode | null;
  startedAt: string;
  endedAt: string | null;
  /** The job the interview was for, when one was given. */
  title: string | null;
  questions: LedgerQuestion[];
  /** Follow-ups asked, and the words the candidate said, across the interview. */
  followUps: number;
  words: number;
}

export interface LedgerSessionRow {
  id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  /** `engine_state->>mode` (SESSION_JSON_COLUMNS). */
  mode?: string | null;
  /** `question_plan->role->>title`. */
  role_title?: string | null;
}

export interface LedgerTurnRow {
  id: string;
  session_id: string;
  seq: number;
  topic: string | null;
  question_type: string | null;
  question_source?: string | null;
  question_text?: string | null;
  answer_transcript?: string | null;
  /** Sent only with a spoken answer. */
  capture_ms?: number | null;
}

export interface LedgerVolume {
  number: number;
  count: number;
  /** Interviews in the volumes before this one (the newer ones). */
  offset: number;
  /** Interviews in every volume. */
  total: number;
}

export interface LedgerOwner {
  username: string | null;
  memberCode: string;
}

export interface LedgerProgress {
  completed: number;
  inProgress: number;
  /** The most recent completed interview, whose report holds its scorecard. */
  latestId: string | null;
  /** Its headline score, the mean of its question scores. */
  latestOverall: number | null;
}

/** An interview's running number: the first one ever is no. 1. */
export function entryNumber(volume: LedgerVolume, index: number): number {
  return volume.total - volume.offset - index;
}

/** How an answer was given: "Typed", or "Spoken" and for how long. */
export function answeredBy(spokenMs: number | null): string {
  if (spokenMs === null) return "Typed";
  const seconds = Math.round(spokenMs / 1000);
  if (seconds < 1) return "Spoken";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `Spoken for ${minutes ? `${minutes} min${rest ? ` ${rest} s` : ""}` : `${rest} s`}`;
}

export function ledgerEntries(sessions: LedgerSessionRow[], turns: LedgerTurnRow[]): LedgerEntry[] {
  const turnsBySession = new Map<string, LedgerTurnRow[]>();
  for (const t of turns) turnsBySession.set(t.session_id, [...(turnsBySession.get(t.session_id) ?? []), t]);

  return sessions.map((s): LedgerEntry => {
    const rows = (turnsBySession.get(s.id) ?? []).map((row) => ({ seq: row.seq, questionType: row.question_type, row }));
    const questions = questionThreads(rows).map(
      (thread, i): LedgerQuestion => ({
        ref: questionRef(i),
        label: topicLabel(thread[0].row.topic),
        fromResume: thread[0].row.question_source === "resume",
        turns: thread.map(({ row }) => ({
          id: row.id,
          seq: row.seq,
          questionType: oneOf(QUESTION_TYPES, row.question_type),
          questionText: row.question_text?.trim() ?? "",
          answer: row.answer_transcript?.trim() ?? "",
          spokenMs: row.capture_ms ?? null,
        })),
      }),
    );
    const said = questions.flatMap((q) => q.turns);
    return {
      id: s.id,
      status: s.status === "completed" ? "completed" : "in_progress",
      mode: modeFromRow(s.mode),
      startedAt: s.started_at,
      endedAt: s.ended_at,
      title: s.role_title?.trim() || null,
      questions,
      followUps: said.length - questions.length,
      words: said.reduce((n, t) => n + wordCount(t.answer), 0),
    };
  });
}

// The book

/** A volume of the ledger, open at its contents. Volume 1 holds the newest interviews. */
export function ledgerVolumeHref(volume: number): string {
  return `/dashboard?open=ledger&section=history${volume === 1 ? "" : `&page=${volume}`}`;
}

/** The ledger open at one interview, in whichever volume holds it. */
export function ledgerEntryHref(id: string): string {
  return `/dashboard?open=ledger&entry=${encodeURIComponent(id)}`;
}

/**
 * Pages before the interviews: the front cover, then bookplate | contents
 * and progress | trends. The first interview starts on a left-hand page.
 */
export const LEDGER_FLOW_START = 5;
export const LEDGER_CONTENTS_PAGE = 2;
export const LEDGER_PROGRESS_PAGE = 3;

export type LedgerBlockKind = "overview" | "transcript" | "ask" | "answer" | "where-next" | "pending";

/** One printed block of an interview's record, before it is measured. */
export interface LedgerBlock extends Omit<FlowBlock, "height"> {
  kind: LedgerBlockKind;
  /** The entry's index in the volume. */
  entry: number;
  /** "ask" and "answer": the question's index in the entry, and the turn's in the question. */
  question?: number;
  turn?: number;
  /** "answer": this piece of it, and whether it is the first or the last. */
  text?: string;
  first?: boolean;
  last?: boolean;
}

/**
 * Each interview's blocks: its overview alone on a left-hand page, then from
 * the facing page its transcript, question by question, each follow-up under
 * the question it added to, and where to go next: the report, or back into
 * an unfinished interview.
 */
export function ledgerFlow(entries: LedgerEntry[]): LedgerBlock[] {
  return entries.flatMap((e, entry) => {
    const details: LedgerBlock[] = [];
    if (e.questions.length) {
      details.push({ id: `tr-${e.id}`, kind: "transcript", entry, keepWithNext: true });
      e.questions.forEach((q, question) =>
        q.turns.forEach((t, turn) => {
          // A question is never left at the foot of a page without its answer.
          details.push({ id: `ask-${t.id}`, kind: "ask", entry, question, turn, keepWithNext: true });
          const pieces = splitText(t.answer, LEDGER_TEXT_CHARS);
          (pieces.length ? pieces : [""]).forEach((text, k, all) =>
            details.push({
              id: `ans-${t.id}-${k}`,
              kind: "answer",
              entry,
              question,
              turn,
              text,
              first: k === 0,
              last: k === all.length - 1,
            }),
          );
        }),
      );
      details.push({ id: `wn-${e.id}`, kind: "where-next", entry });
    } else details.push({ id: `p-${e.id}`, kind: "pending", entry });
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

// Loading (RLS scopes every row to the signed-in user)

const VOLUME_COLUMNS = `id, status, started_at, ended_at, ${SESSION_JSON_COLUMNS}`;
const TURN_COLUMNS =
  "id, session_id, seq, topic, question_type, question_source, question_text, answer_transcript, capture_ms";

/** The record as a whole: how many interviews, how many finished, the trend, and whose it is. */
export interface LedgerShelf {
  total: number;
  completed: number;
  trend: TrendPoint[];
  owner: LedgerOwner | null;
}

export async function loadLedgerShelf(supabase: RowReader, userId: string): Promise<LedgerShelf> {
  const [totalRes, trendRes, profileRes] = await Promise.all([
    supabase.from("interview_sessions").select("id", { count: "exact", head: true }),
    supabase
      .from("interview_sessions")
      .select("id, started_at, overall_scores", { count: "exact" })
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(TREND_LIMIT),
    // Not essential: without it the ledger just doesn't say whose it is.
    supabase.from("profiles").select("username, member_code").eq("id", userId).maybeSingle(),
  ]);
  if (totalRes.error) throw new Error(`dashboard count: ${totalRes.error.message}`);
  if (trendRes.error) throw new Error(`dashboard trend: ${trendRes.error.message}`);
  const profile = profileRes.error ? null : (profileRes.data as { username: string | null; member_code: string } | null);
  const trendRows = (trendRes.data ?? []) as { id: string; started_at: string; overall_scores: unknown }[];
  return {
    total: totalRes.count ?? 0,
    completed: trendRes.count ?? 0,
    // Oldest first, for the chart.
    trend: trendRows
      .map((r) => ({ id: r.id, startedAt: r.started_at, scores: pickScores(r.overall_scores), overall: pickOverall(r.overall_scores) }))
      .reverse(),
    owner: profile ? { username: profile.username, memberCode: profile.member_code } : null,
  };
}

/** One volume: rows `from` to `to` (newest first), each with every turn of it. */
export async function loadLedgerVolume(supabase: RowReader, [from, to]: [number, number]): Promise<LedgerEntry[]> {
  const { data: rows, error } = await supabase
    .from("interview_sessions")
    .select(VOLUME_COLUMNS)
    .order("started_at", { ascending: false })
    .range(from, to);
  if (error) throw new Error(`dashboard sessions: ${error.message}`);
  const sessions = (rows ?? []) as unknown as LedgerSessionRow[];
  const ids = sessions.map((s) => s.id);
  if (!ids.length) return [];

  const { data: turns, error: turnsError } = await supabase
    .from("turns")
    .select(TURN_COLUMNS)
    .in("session_id", ids)
    .order("seq", { ascending: true })
    .limit(VOLUME_SIZE * FULL_QUESTION_CAP_MAX);
  if (turnsError) throw new Error(`dashboard turns: ${turnsError.message}`);
  return ledgerEntries(sessions, (turns ?? []) as unknown as LedgerTurnRow[]);
}

/** The volume an interview is printed in, counting newest first; null when there is no such interview. */
export async function loadEntryVolume(supabase: RowReader, id: string): Promise<number | null> {
  const { data, error } = await supabase.from("interview_sessions").select("started_at").eq("id", id).maybeSingle();
  if (error) throw new Error(`ledger entry: ${error.message}`);
  const startedAt = (data as { started_at: string } | null)?.started_at;
  if (!startedAt) return null;
  const newer = await supabase
    .from("interview_sessions")
    .select("id", { count: "exact", head: true })
    .gt("started_at", startedAt);
  if (newer.error) throw new Error(`ledger entry: ${newer.error.message}`);
  return Math.floor((newer.count ?? 0) / VOLUME_SIZE) + 1;
}
