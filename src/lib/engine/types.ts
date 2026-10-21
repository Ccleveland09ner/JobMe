/** Core engine types, with no runtime dependencies. */

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

/** Scoring dimensions. STAR is scored per component, so the notepad can say "no Result". */
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

/** Tie-break order for primary_gap: what a follow-up gains most (ownership, outcome) first. */
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

/** Banding uses the STAR components, not all eight, to keep `great` reachable. */
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

/** Where a question came from, so the policy can alternate like a real screen. */
export type QuestionSource = "bank" | "resume";

/** Quick: bank-led and bounded. Full: covers every role and project. */
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
  /** 0..1 match against the job description; drives ask order. */
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

/** A session's source of truth, saved as interview_sessions.engine_state each turn. */
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

  /** Coverage list, most relevant first. Full mode won't wrap while any is uncovered. */
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

/** Bank threads full mode spends before pure coverage (fixed: 1:1 alternation couldn't finish). */
export const FULL_BANK_THREADS = 3;

/** Turns a thread costs: an opening plus its follow-ups (measured by scripts/measure-pacing.ts). */
export const TURNS_PER_BANK_THREAD = 3;
export const TURNS_PER_RESUME_THREAD = 2;

/** Sized so every resume item can be covered, plus the bank budget and one turn of slack. */
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

/** One scored answer; `scores` blends the model's judgement with embedding relevance. */
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
