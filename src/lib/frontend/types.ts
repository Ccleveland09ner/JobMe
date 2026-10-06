/**
 * View types: what pages and components render.
 *
 * These describe the API responses and table rows the frontend consumes,
 * narrowed to what is safe and useful to show. They deliberately do NOT carry
 * `EngineState` — engine internals stay on the server; pages extract a
 * `ProgressView` and the current question instead (see adapters.ts).
 *
 * Shapes follow the route implementations, not the tech design, where the two
 * disagree:
 *   - POST /api/sessions             src/app/api/sessions/route.ts
 *   - POST /api/sessions/[id]/turns  src/app/api/sessions/[id]/turns/route.ts
 *   - POST /api/sessions/[id]/report src/lib/interview/report.ts (ReportBody)
 */

import type {
  Band,
  Dimension,
  InterviewMode,
  Move,
  QuestionSource,
  QuestionType,
  Scores,
  TopicId,
} from "../engine/types";
import type { ReportStats } from "../ai/report";

/** Typed answers, or push-to-talk voice. Chosen on setup, passed as `?input=`. */
export type InputMode = "typed" | "voice";

/** The question currently on screen. */
export interface QuestionView {
  text: string;
  type: QuestionType;
  topic: TopicId;
  source: QuestionSource;
  /** Spoken before `text` when a new thread opens. Never shown alone. */
  lead?: string;
}

/**
 * Interview progress. Every field past `questionCount` is optional because
 * the create and turn responses expose different subsets, and the component
 * must degrade rather than break when one is missing.
 */
export interface ProgressView {
  mode?: InterviewMode;
  /** The number of the question on screen. Starts at 1. */
  questionCount: number;
  /** Upper bound, not a promise: an interview can wrap before it. */
  questionCap?: number;
  coverageDone?: number;
  coverageTotal?: number;
  topicIndex?: number;
  topicsTotal?: number;
}

/**
 * One Recruiter's Notepad entry. Mirrors `NotepadEntry` in
 * lib/interview/turn.ts — the shape the turn route actually returns, which
 * has `source` and `degraded` where engine/types.ts's older copy does not.
 */
export interface NoteView {
  seq: number;
  topic: TopicId;
  /** The type of the question that was answered. */
  questionType: QuestionType;
  source: QuestionSource | null;
  /** Null when unscored. May be partial on legacy rows. */
  scores: Partial<Scores> | null;
  band: Band | null;
  primaryGap: Dimension | null;
  evidence: string | null;
  observation: string;
  /** Why the next move, built deterministically on the server. */
  reason: string;
  /** Scoring was unavailable and the fallback policy stood in. */
  degraded: boolean;
}

// ---------------------------------------------------------------------------
// API responses
// ---------------------------------------------------------------------------

export interface CreateSessionResponse {
  sessionId: string;
  mode: InterviewMode;
  introLine: string;
  question: QuestionView & { difficulty: number };
  personalized: boolean;
  job: { title: string | null; company: string | null; provider: string } | null;
  progress: {
    questionCount: number;
    questionCap: number;
    coverageTotal: number;
    coverageDone: number;
  };
}

export type TurnResponse =
  | { kind: "nudge"; line: string }
  | {
      kind: "turn";
      move: Move;
      notepad: NoteView;
      next: (QuestionView & { difficulty: number }) | null;
      done: boolean;
      wrapLine?: string;
      progress: {
        questionCount: number;
        questionCap: number;
        topicIndex: number;
        topicsTotal: number;
        coverageDone: number;
        coverageTotal: number;
      };
    };

export interface ResumeUploadResponse {
  resumeId: string;
  pageCount: number;
  coverage: { id: string; kind: "role" | "project"; label: string; relevance: number }[];
  role: { title: string; seniority: string } | null;
  layoutSuspect: boolean;
  extractedPreview: string;
}

export interface ReportView {
  summary: string;
  weakestTurnId: string | null;
  rewrite: string | null;
  stats: ReportStats | null;
  /** Backend-computed, scored turns only. Never re-averaged on the client. */
  overallScores: Partial<Scores> | null;
}

// ---------------------------------------------------------------------------
// Rows the pages read directly (RLS-scoped)
// ---------------------------------------------------------------------------

export type SessionStatus = "in_progress" | "completed";

export interface SessionSummary {
  id: string;
  status: SessionStatus;
  mode: InterviewMode | null;
  startedAt: string;
  endedAt: string | null;
  questionCount: number;
  overallScores: Partial<Scores> | null;
}

/** One answered question on the scorecard. */
export interface ReportTurnView {
  id: string;
  seq: number;
  topic: TopicId | null;
  questionType: QuestionType | null;
  source: QuestionSource | null;
  questionText: string;
  answer: string;
  scores: Partial<Scores> | null;
  band: Band | null;
  primaryGap: Dimension | null;
  evidence: string | null;
  wpm: number | null;
  fillers: number | null;
}

/** The candidate's latest resume, as setup offers it. */
export interface ResumeSummary {
  id: string;
  createdAt: string;
  pageCount: number | null;
  items: { kind: "role" | "project"; label: string }[];
}
