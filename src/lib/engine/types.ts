/**
 * Core engine types. Pure TypeScript, no runtime dependencies.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > Data Model > `EngineState`
 *      docs/TechDesign-JobMe-MVP.md > Adaptive Engine
 *
 * These are written out in full (not stubbed) because every other engine,
 * AI and UI module types against them.
 */

/** The 5 behavioural topics. A session covers 4 of them. */
export type TopicId =
  | "teamwork"
  | "handling_failure"
  | "technical_challenge"
  | "conflict"
  | "learning_fast";

export const TOPIC_IDS: readonly TopicId[] = [
  "teamwork",
  "handling_failure",
  "technical_challenge",
  "conflict",
  "learning_fast",
] as const;

/** The 5 scoring dimensions. */
export type Dimension =
  | "structure"
  | "specificity"
  | "impact"
  | "ownership"
  | "relevance";

/**
 * Tie-break order for `primary_gap` when several dimensions share the lowest
 * score. Recomputed in code so the gap is deterministic and never drifts from
 * the model's own opinion.
 *
 * Ref: TechDesign > API Contracts > `Evaluation` Zod schema
 */
export const GAP_PRIORITY: readonly Dimension[] = [
  "ownership",
  "impact",
  "specificity",
  "structure",
  "relevance",
] as const;

/** Every dimension scored 1-4. */
export type Scores = Record<Dimension, number>;

/** Answer quality band. Drives the next move. */
export type Band = "weak" | "mediocre" | "great";

/** What kind of question was asked. Mirrors `turns.question_type`. */
export type QuestionType = "opening" | "deepen" | "clarify";

/** What the policy decided to do next. `wrap` ends the session. */
export type Move = QuestionType | "wrap";

/** Difficulty ladder. Bumps by 1 (max 3) when a thread ends `great`. */
export type Difficulty = 1 | 2 | 3;

export interface Question {
  text: string;
  type: QuestionType;
  topic: TopicId;
  difficulty: number;
}

/**
 * Live source of truth for a session, persisted as
 * `interview_sessions.engine_state` (jsonb) and rewritten every turn.
 * Serverless-safe and refresh-resumable.
 */
export interface EngineState {
  /** The 4 chosen topics, in ask order. */
  topics: TopicId[];
  /** 0..3 — index into `topics`. */
  topicIndex: number;
  difficulty: Difficulty;
  /** Follow-ups spent in the current thread. Resolves at 2. */
  followUpsUsed: 0 | 1 | 2;
  lastMove: QuestionType;
  lastBand: Band | null;
  /** Answers in the current thread, for the plateau check. */
  threadScores: Scores[];
  /** Scored questions asked. Hard cap 10. */
  questionCount: number;
  /** Answered turns. Used for submit idempotency via `clientTurnSeq`. */
  turnSeq: number;
  currentQuestion: Question;
  /** P1: repeat avoidance. */
  askedQuestions: string[];
  done: boolean;
}

/**
 * One scored answer. `scores` is the blended result: the LLM's judgement with
 * Relevance averaged against the embedding similarity signal.
 *
 * Ref: TechDesign > Evaluator, > Embedding Checks
 */
export interface Evaluation {
  scores: Scores;
  primaryGap: Dimension;
  /** Verbatim quote from the answer, <= 20 words. */
  evidence: string;
  /** Notepad observation line, <= 90 chars. */
  observation: string;
  offTopic: boolean;
  band: Band;
  drafts: { deepen: string; clarify: string };
}

/** What `policy.step()` returns. `question` is null only when move is `wrap`. */
export interface StepResult {
  state: EngineState;
  move: Move;
  question: Question | null;
}

/** One rendered notepad entry, as returned by the turn route. */
export interface NotepadEntry {
  seq: number;
  topic: TopicId;
  questionType: QuestionType;
  scores: Scores | null;
  band: Band | null;
  primaryGap: Dimension | null;
  evidence: string | null;
  /** What the recruiter noticed (from the LLM). */
  observation: string;
  /** Why this next move (deterministic, built in notepad.ts). */
  reason: string;
}
