/**
 * View types: the API responses and rows the frontend renders, narrowed to
 * what is safe to show. EngineState stays on the server.
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

/** Interview progress; fields past questionCount are optional (the responses differ). */
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

/** One notepad entry, as the turn route returns it (NotepadEntry in lib/interview/turn.ts). */
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

// API responses

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

// Rows the pages read directly (RLS-scoped)

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
