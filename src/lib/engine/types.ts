/**
 * Core engine types. Pure, no runtime dependencies — every engine, AI and UI
 * module types against these.
 *
 * Ref: TechDesign > Data Model, > Adaptive Engine
 */

/** The topic bank. A session covers a subset, chosen by mode and resume. */
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
 * Scoring dimensions. STAR is scored per-component rather than as one
 * "structure" number so the notepad can say "no Result" instead of "structure: 2".
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
 * Tie-break order for `primary_gap`, computed in code so it never drifts from
 * the model's opinion. Ordered by what a follow-up actually gains: recruiters
 * chase ownership and outcome; Situation and Task are scene-setting.
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
 * Mean of the STAR components, used for banding instead of all eight
 * dimensions: `great` needs `min >= 3`, and eight dimensions give three extra
 * chances to trip it — Task especially, which speakers fold into Situation.
 * Banding over five keeps `great` reachable; all eight stay visible as gaps.
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
 * Where a question came from. Tracked so the policy can alternate the way a
 * real screen does, instead of drifting into all-generic or all-resume.
 */
export type QuestionSource = "bank" | "resume";

/**
 * Quick: bank-led, bounded, reproducible — the practice and demo format.
 * Full: covers every role and project, so its length scales with the resume.
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
   * 0..1 match against the job description. Drives ask order, so a truncated
   * interview still covered the most relevant experience.
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
 * Source of truth for a session. Persisted as `interview_sessions.engine_state`
 * jsonb and rewritten every turn — serverless-safe and refresh-resumable.
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
  /** Ceiling for this session: fixed in quick mode, resume-derived in full. */
  questionCap: number;
  /** Answered turns. Used for submit idempotency via `clientTurnSeq`. */
  turnSeq: number;
  currentQuestion: Question;
  /** Repeat avoidance, and the `checkDraft` repeat gate. */
  askedQuestions: string[];

  /**
   * Coverage list, most relevant to the target role first. Full mode will not
   * wrap while any is uncovered; quick mode covers as many as its cap allows,
   * which is why the ordering matters.
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
export const FULL_QUESTION_CAP_MAX = 30;

/** Full mode is at least this long even for a one-line resume. */
export const FULL_QUESTION_CAP_MIN = 8;

/**
 * Bank threads full mode spends before it switches to pure coverage.
 *
 * Fixed rather than alternating. Measured: 1:1 alternation spent half the
 * interview on bank questions (12 bank turns against 12 resume turns for six
 * items), which is why coverage could not finish inside any sane cap.
 */
export const FULL_BANK_THREADS = 3;

/**
 * Turns a thread costs: one opening plus its follow-ups.
 *
 * MEASURED by scripts/measure-pacing.ts across five band patterns. A bank
 * thread runs to the full two follow-ups on an answer that keeps improving;
 * a full-mode resume thread is capped at one follow-up so breadth wins over
 * depth, which is the distinction between the modes.
 */
export const TURNS_PER_BANK_THREAD = 3;
export const TURNS_PER_RESUME_THREAD = 2;

/**
 * Sized so every resume item can be covered, with the bank budget on top.
 *
 * The previous formula assumed two turns per item and no bank overhead, which
 * left six items needing 36 turns against a cap of 16 — the mode could not
 * keep its own promise. Derived from measurement instead, plus one turn of
 * slack so a thread that resolves late is not truncated.
 */
export function fullModeCap(resumeItemCount: number): number {
  const budget =
    resumeItemCount * TURNS_PER_RESUME_THREAD +
    FULL_BANK_THREADS * TURNS_PER_BANK_THREAD +
    1;
  return Math.max(
    FULL_QUESTION_CAP_MIN,
    Math.min(FULL_QUESTION_CAP_MAX, budget),
  );
}

/** Items a full-mode session can cover inside FULL_QUESTION_CAP_MAX. */
export function maxCoverableItems(): number {
  return Math.floor(
    (FULL_QUESTION_CAP_MAX - FULL_BANK_THREADS * TURNS_PER_BANK_THREAD - 1) /
      TURNS_PER_RESUME_THREAD,
  );
}

/** Items still needing at least one question. */
export function uncoveredItems(state: EngineState): ResumeItem[] {
  return state.resumeItems.filter((i) => !i.covered);
}

/**
 * One scored answer. `scores` blends the model's judgement with the embedding
 * relevance signal. Ref: TechDesign > Evaluator, > Embedding Checks
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
