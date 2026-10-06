/**
 * Row and response -> view adapters. Pure, so they are unit-tested and safe
 * to call on either side of the server/client boundary.
 *
 * The rule these enforce: the frontend FORMATS what the backend decided, it
 * never re-decides it. Band, move, gap, reason, cap and coverage are passed
 * through untouched. The one derived figure is `displayAverage()`, and it
 * averages values the backend already averaged over scored turns only.
 */

import {
  DIMENSIONS,
  type Band,
  type Dimension,
  type EngineState,
  type InterviewMode,
  type QuestionSource,
  type QuestionType,
  type Scores,
  type TopicId,
} from "../engine/types";
import type {
  NoteView,
  ProgressView,
  QuestionView,
  ReportTurnView,
  SessionStatus,
  SessionSummary,
} from "./types";

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

const DIMENSION_SET = new Set<string>(DIMENSIONS);

export function isDimension(value: unknown): value is Dimension {
  return typeof value === "string" && DIMENSION_SET.has(value);
}

/**
 * Keeps the known dimensions with numeric values. Anything else — including a
 * legacy five-dimension `structure` key — is dropped rather than rendered as
 * a ninth bar. Null and empty both mean "unscored".
 */
export function pickScores(raw: unknown): Partial<Scores> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Partial<Scores> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isDimension(key) && typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** [dimension, value] in rubric order, skipping dimensions with no value. */
export function scoreEntries(scores: Partial<Scores>): [Dimension, number][] {
  return DIMENSIONS.flatMap((d) =>
    typeof scores[d] === "number" ? [[d, scores[d] as number] as [Dimension, number]] : [],
  );
}

/**
 * One headline number for a dashboard row: the mean of the backend's
 * per-dimension `overall_scores`, which already exclude unscored turns. Not
 * used anywhere a decision is made.
 */
export function displayAverage(scores: Partial<Scores> | null): number | null {
  if (!scores) return null;
  const values = scoreEntries(scores).map(([, v]) => v);
  if (!values.length) return null;
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1));
}

/** Bar fill colour bucket for a 1-4 value (fractional averages round). */
export function scoreLevel(value: number): 1 | 2 | 3 | 4 {
  return Math.min(4, Math.max(1, Math.round(value))) as 1 | 2 | 3 | 4;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

const BANDS = new Set(["weak", "mediocre", "great"]);
const QUESTION_TYPES = new Set(["opening", "deepen", "clarify"]);
const SOURCES = new Set(["bank", "resume"]);

function oneOf<T extends string>(set: Set<string>, value: unknown): T | null {
  return typeof value === "string" && set.has(value) ? (value as T) : null;
}

/** The `turns` columns the notepad needs. */
export interface TurnRow {
  id?: string;
  seq: number;
  topic: string | null;
  question_type: string | null;
  question_source?: string | null;
  question_text?: string | null;
  answer_transcript?: string | null;
  scores: unknown;
  band: string | null;
  primary_gap: string | null;
  evidence: string | null;
  notepad_text: string | null;
  reason_text: string | null;
  degraded_reason?: string | null;
  wpm?: number | null;
  filler_count?: number | null;
}

/** A persisted turn as a notepad entry — what refresh-resume rebuilds from. */
export function noteFromTurnRow(row: TurnRow): NoteView {
  const scores = pickScores(row.scores);
  return {
    seq: row.seq,
    topic: (row.topic ?? "teamwork") as TopicId,
    questionType: oneOf<QuestionType>(QUESTION_TYPES, row.question_type) ?? "opening",
    source: oneOf<QuestionSource>(SOURCES, row.question_source),
    scores,
    band: oneOf<Band>(BANDS, row.band),
    primaryGap: isDimension(row.primary_gap) ? row.primary_gap : null,
    evidence: row.evidence || null,
    observation: row.notepad_text ?? "",
    reason: row.reason_text ?? "",
    degraded: Boolean(row.degraded_reason) || scores === null,
  };
}

/**
 * A notepad entry from the turn route. Already NoteView-shaped; this only
 * guards the score keys so a malformed payload cannot render stray bars.
 */
export function noteFromResponse(note: NoteView): NoteView {
  const scores = pickScores(note.scores);
  return { ...note, scores, degraded: note.degraded || scores === null };
}

export function reportTurnFromRow(row: TurnRow & { id: string }): ReportTurnView {
  return {
    id: row.id,
    seq: row.seq,
    topic: (row.topic as TopicId | null) ?? null,
    questionType: oneOf<QuestionType>(QUESTION_TYPES, row.question_type),
    source: oneOf<QuestionSource>(SOURCES, row.question_source),
    questionText: row.question_text ?? "",
    answer: row.answer_transcript ?? "",
    scores: pickScores(row.scores),
    band: oneOf<Band>(BANDS, row.band),
    primaryGap: isDimension(row.primary_gap) ? row.primary_gap : null,
    evidence: row.evidence || null,
    wpm: row.wpm ?? null,
    fillers: row.filler_count ?? null,
  };
}

export interface SessionRowData {
  id: string;
  status: string;
  question_count: number | null;
  overall_scores: unknown;
  started_at: string;
  ended_at: string | null;
  /** `engine_state->>mode`, selected as a plain column. */
  mode?: string | null;
}

export function sessionSummaryFromRow(row: SessionRowData): SessionSummary {
  return {
    id: row.id,
    status: (row.status === "completed" ? "completed" : "in_progress") as SessionStatus,
    mode: row.mode === "quick" || row.mode === "full" ? (row.mode as InterviewMode) : null,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    questionCount: row.question_count ?? 0,
    overallScores: pickScores(row.overall_scores),
  };
}

// ---------------------------------------------------------------------------
// Engine state -> view (SERVER side: keeps engine_state off the client)
// ---------------------------------------------------------------------------

/**
 * Reads progress out of the engine state. Reads, not computes: the cap and
 * the coverage flags are the engine's; this only counts covered items, which
 * is exactly what the turn route reports as `coverageDone`.
 */
export function progressFromState(state: EngineState): ProgressView {
  const items = state.resumeItems ?? [];
  return {
    mode: state.mode,
    questionCount: state.questionCount,
    questionCap: state.questionCap,
    coverageDone: items.filter((i) => i.covered).length,
    coverageTotal: items.length,
    topicIndex: state.topicIndex,
    topicsTotal: state.topics?.length,
  };
}

export function questionFromState(state: EngineState): QuestionView {
  const q = state.currentQuestion;
  return { text: q.text, type: q.type, topic: q.topic, source: q.source };
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export interface EvidenceSplit {
  before: string;
  match: string;
  after: string;
}

/**
 * Locates the evidence quote inside the answer, case-insensitively. Null when
 * it is not there — the caller then shows the quote beneath the answer rather
 * than dropping it.
 */
export function findEvidence(
  answer: string,
  evidence: string | null | undefined,
): EvidenceSplit | null {
  const quote = evidence?.trim();
  if (!quote || !answer) return null;
  const at = answer.toLowerCase().indexOf(quote.toLowerCase());
  if (at < 0) return null;
  return {
    before: answer.slice(0, at),
    match: answer.slice(at, at + quote.length),
    after: answer.slice(at + quote.length),
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * A message a candidate can read. Route `error` strings are written for the
 * candidate already, except the two technical ones below; `detail` (Zod
 * issues) and anything unexpected never reach the screen.
 */
export function friendlyError(status: number, body: unknown): string {
  const message =
    body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : null;

  if (status === 401) return "Your sign-in has expired. Please sign in again.";
  if (status === 404) return "We couldn't find that interview.";
  if (status === 413) return message ?? "That file is too large.";
  if (status === 429) return "Too many requests right now. Please wait a moment and try again.";

  const technical = new Set(["Invalid request", "Stale turn sequence", "Unauthorized"]);
  if (message && !technical.has(message) && message.length <= 200) return message;

  if (status === 422) return "Some of those details don't look right. Please check and try again.";
  return "Something went wrong. Please try again.";
}
