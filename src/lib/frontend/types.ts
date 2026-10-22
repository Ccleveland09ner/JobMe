/**
 * View types: the API responses and rows the frontend renders, narrowed to
 * what is safe to show. EngineState stays on the server.
 */

import type {
  Band,
  AnyDimension,
  InterviewMode,
  Move,
  QuestionSource,
  QuestionType,
  QuestionKind,
  StoredScores,
  TopicId,
} from "../engine/types";
import type { QuestionGroup } from "../stats";

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
  /** The rubric it was scored on; absent on rows rebuilt from the database. */
  kind?: QuestionKind;
  /**
   * Null when unscored. Only the dimensions its kind is scored on; legacy
   * rows carry the old STAR keys. A follow-up's scores are cumulative: the
   * whole answer to the original question so far.
   */
  scores: StoredScores | null;
  band: Band | null;
  primaryGap: AnyDimension | null;
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
  job: {
    title: string | null;
    company: string | null;
    companyInferred?: boolean;
    provider: string;
  } | null;
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
  chunkCount: number;
  /** How many of each kind of personal detail redaction removed. */
  redacted: Record<string, number>;
  hasFacts: boolean;
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
  overallScores: StoredScores | null;
  /** The session's headline 1-4 score; null when unscored. */
  overall: number | null;
}

/** One completed interview on the trend chart. */
export interface TrendPoint {
  id: string;
  startedAt: string;
  scores: StoredScores | null;
  /** The stored headline score; see pickOverall. */
  overall: number | null;
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
  scores: StoredScores | null;
  band: Band | null;
  primaryGap: AnyDimension | null;
  evidence: string | null;
  wpm: number | null;
  fillers: number | null;
}

/**
 * One ORIGINAL question on the scorecard: its opening turn, the follow-ups
 * that added to it, and the score of the whole answer (the latest cumulative
 * evaluation). `ref` ("Q2") is how the report's feedback cites it.
 */
export interface ReportQuestionView<T extends ReportTurnView = ReportTurnView> extends QuestionGroup<T> {
  ref: string;
  /** The competency, e.g. "Influencing others". */
  label: string;
  /** What the question assessed for this job. */
  purpose: string;
}

/** The candidate's latest resume, as setup offers it. */
export interface ResumeSummary {
  id: string;
  createdAt: string;
  pageCount: number | null;
  items: { kind: "role" | "project"; label: string }[];
}
