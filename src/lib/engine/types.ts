/**
 * Core engine types. Pure TypeScript, no runtime dependencies.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > Data Model > `EngineState`
 *      docs/TechDesign-JobMe-MVP.md > Adaptive Engine
 *
 * These are written out in full (not stubbed) because every other engine,
 * AI and UI module types against them.
 */

/**
 * The behavioural topic bank, drawn from the questions that actually recur in
 * behavioural screens. A session covers a subset; which subset depends on the
 * mode and on what the candidate's resume evidences.
 */
export type TopicId =
  | "teamwork"
  | "conflict"
  | "learning_fast"
  | "handling_failure"
  | "leadership"
  | "problem_solving"
  | "persuasion"
  | "prioritisation"
  | "process_improvement"
  | "pressure"
  | "technical_challenge";

export const TOPIC_IDS: readonly TopicId[] = [
  "teamwork",
  "conflict",
  "learning_fast",
  "handling_failure",
  "leadership",
  "problem_solving",
  "persuasion",
  "prioritisation",
  "process_improvement",
  "pressure",
  "technical_challenge",
] as const;

/**
 * Scoring dimensions.
 *
 * The first four are the STAR components, scored individually rather than
 * rolled into one "structure" number, so the notepad can name exactly which
 * part of the story is missing ("no Result" reads better, and coaches better,
 * than "structure: 2").
 */
export type StarDimension = "situation" | "task" | "action" | "result";

export type Dimension =
  | StarDimension
  | "specificity"
  | "impact"
  | "ownership"
  | "relevance";

export const STAR_DIMENSIONS: readonly StarDimension[] = [
  "situation",
  "task",
  "action",
  "result",
] as const;

export const DIMENSIONS: readonly Dimension[] = [
  ...STAR_DIMENSIONS,
  "specificity",
  "impact",
  "ownership",
  "relevance",
] as const;

/**
 * Tie-break order for `primary_gap` when several dimensions share the lowest
 * score. Recomputed in code so the gap is deterministic and never drifts from
 * the model's own opinion.
 *
 * Ordered by how much a follow-up on that gap improves the answer. Ownership
 * and outcome are what recruiters actually chase; Situation and Task are
 * scene-setting and rarely worth a whole follow-up.
 */
export const GAP_PRIORITY: readonly Dimension[] = [
  "ownership",
  "impact",
  "result",
  "action",
  "specificity",
  "task",
  "situation",
  "relevance",
] as const;

/** Every dimension scored 1-4. */
export type Scores = Record<Dimension, number>;

/**
 * Mean of the four STAR components — the band's stand-in for the old single
 * `structure` score.
 *
 * WHY BANDING USES THIS RATHER THAN ALL EIGHT DIMENSIONS. The `great` rule is
 * `avg >= 3.5 && min >= 3`. Going from 5 dimensions to 8 gives three more
 * chances to trip the `min` clause, and Task is the component speakers most
 * often fold into Situation, so `great` would become nearly unreachable and
 * the weak-vs-strong contrast the demo depends on would collapse. Rolling
 * STAR up keeps the band computed over five comparable values while the eight
 * individual scores stay visible and individually targetable as gaps.
 */
export function starRollup(scores: Scores): number {
  const total = STAR_DIMENSIONS.reduce((sum, d) => sum + scores[d], 0);
  return total / STAR_DIMENSIONS.length;
}

/** The five values banding is computed over. Not persisted — derived. */
export function bandingValues(scores: Scores): number[] {
  return [
    starRollup(scores),
    scores.specificity,
    scores.impact,
    scores.ownership,
    scores.relevance,
  ];
}

/** Answer quality band. Drives the next move. */
export type Band = "weak" | "mediocre" | "great";

/** What kind of question was asked. Mirrors `turns.question_type`. */
export type QuestionType = "opening" | "deepen" | "clarify";

/**
 * Where a question came from.
 *
 * A realistic screen alternates: some threads open with a standard behavioural
 * question and only get personal in the follow-ups, others open directly on
 * something from the resume. Tracking the source lets the policy keep that
 * balance instead of drifting into all-generic or all-resume.
 */
export type QuestionSource = "bank" | "resume";

/**
 * Quick is the practice/demo format: bank-led, bounded, reproducible.
 * Full guarantees coverage of every role and project, so its length scales
 * with the resume.
 */
export type InterviewMode = "quick" | "full";

/** A role or project from the resume that the interview should cover. */
export interface ResumeItem {
  id: string;
  kind: "role" | "project";
  /** Job title or project name, for the question text. */
  label: string;
  employer?: string;
  /** Chunk indices backing this item, for retrieval at question time. */
  chunkSeqs: number[];
  /**
   * 0..1 — how closely this item matches the target role, from the job
   * description. Drives ask order: the most relevant experience gets covered
   * first, so a truncated interview still covered what mattered.
   */
  relevanceToRole: number;
  /** True once the candidate has answered at least one question about it. */
  covered: boolean;
}

/** What the policy decided to do next. `wrap` ends the session. */
export type Move = QuestionType | "wrap";

/** Difficulty ladder. Bumps by 1 (max 3) when a thread ends `great`. */
export type Difficulty = 1 | 2 | 3;

export interface Question {
  text: string;
  type: QuestionType;
  topic: TopicId;
  difficulty: number;
  source: QuestionSource;
  /** Set when `source === 'resume'`: which item this thread is covering. */
  resumeItemId?: string;
}

/**
 * Live source of truth for a session, persisted as
 * `interview_sessions.engine_state` (jsonb) and rewritten every turn.
 * Serverless-safe and refresh-resumable.
 */
export interface EngineState {
  mode: InterviewMode;
  /** Chosen bank topics, in ask order. */
  topics: TopicId[];
  /** Index into `topics`. */
  topicIndex: number;
  difficulty: Difficulty;
  /** Follow-ups spent in the current thread. Resolves at 2. */
  followUpsUsed: 0 | 1 | 2;
  lastMove: QuestionType;
  lastBand: Band | null;
  /** Answers in the current thread, for the plateau check. */
  threadScores: Scores[];
  /** Scored questions asked. Stops at `questionCap`. */
  questionCount: number;
  /**
   * Hard ceiling for this session. Fixed at QUICK_QUESTION_CAP in quick mode;
   * in full mode derived from the number of resume items to cover, so a thin
   * resume still yields a short interview.
   */
  questionCap: number;
  /** Answered turns. Used for submit idempotency via `clientTurnSeq`. */
  turnSeq: number;
  currentQuestion: Question;
  /** Repeat avoidance, and the `checkDraft` repeat gate. */
  askedQuestions: string[];

  /**
   * Resume coverage, ordered most-relevant-to-the-target-role first.
   *
   * Full mode will not wrap while any of these is uncovered; quick mode
   * covers as many as its cap allows, which is why the ordering matters —
   * a truncated interview must still have covered the experience closest to
   * the job being applied for.
   */
  resumeItems: ResumeItem[];
  /** Index of the item the current resume-led thread is about. */
  resumeItemIndex: number;
  /** Alternation bookkeeping, so the mix stays balanced. */
  lastQuestionSource: QuestionSource;

  done: boolean;
}

/** Quick mode: the practice and demo format. */
export const QUICK_QUESTION_CAP = 10;

/** Full mode never exceeds this, however long the resume. */
export const FULL_QUESTION_CAP_MAX = 24;

/** Full mode is at least this long even for a one-line resume. */
export const FULL_QUESTION_CAP_MIN = 8;

/**
 * Full mode budgets roughly one opening plus one follow-up per resume item,
 * plus a few bank questions so competencies the resume does not evidence
 * still get probed.
 */
export function fullModeCap(resumeItemCount: number): number {
  const budget = resumeItemCount * 2 + 4;
  return Math.max(
    FULL_QUESTION_CAP_MIN,
    Math.min(FULL_QUESTION_CAP_MAX, budget),
  );
}

/** Items still needing at least one question. */
export function uncoveredItems(state: EngineState): ResumeItem[] {
  return state.resumeItems.filter((i) => !i.covered);
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
