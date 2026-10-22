/**
 * Core engine types. Pure, no runtime dependencies — every engine, AI and UI
 * module types against these.
 *
 * Ref: TechDesign > Data Model, > Adaptive Engine; docs/Scoring-Rubric.md
 */

/** The topic bank. A session covers a subset, chosen by role and mode. */
export type TopicId =
  | "motivation"
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
  | "technical_challenge"
  | "technical_knowledge"
  | "product_sense"
  | "data_reasoning";

export const TOPIC_IDS: readonly TopicId[] = [
  "motivation",
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
  "technical_knowledge",
  "product_sense",
  "data_reasoning",
] as const;

/**
 * What kind of question was asked, which decides the rubric it is scored on.
 * A story, a technical explanation and "why this role" show competence in
 * different ways; scoring all three on one STAR rubric marked a correct
 * technical explanation down for having no Situation.
 */
export type QuestionKind =
  | "behavioral"
  | "resume"
  | "technical"
  | "problem_solving"
  | "motivational";

export const QUESTION_KINDS: readonly QuestionKind[] = [
  "behavioral",
  "resume",
  "technical",
  "problem_solving",
  "motivational",
] as const;

/** Kept beside TopicId rather than in the bank, so pure modules can read it. */
export const TOPIC_KINDS: Record<TopicId, QuestionKind> = {
  motivation: "motivational",
  teamwork: "behavioral",
  conflict: "behavioral",
  learning_fast: "behavioral",
  handling_failure: "behavioral",
  leadership: "behavioral",
  problem_solving: "behavioral",
  persuasion: "behavioral",
  prioritisation: "behavioral",
  process_improvement: "behavioral",
  pressure: "behavioral",
  technical_challenge: "behavioral",
  technical_knowledge: "technical",
  product_sense: "problem_solving",
  data_reasoning: "problem_solving",
};

/**
 * The rubric a question is scored on. A resume-led thread is about one item
 * on the resume, whatever competency it lands on; anything else follows its
 * topic. An unknown topic (a legacy row) scores as behavioural.
 */
export function questionKind(q: {
  topic: string | null | undefined;
  source?: string | null;
}): QuestionKind {
  if (q.source === "resume") return "resume";
  return TOPIC_KINDS[q.topic as TopicId] ?? "behavioral";
}

/**
 * Scoring dimensions. Each kind scores a weighted SUBSET (see WEIGHTS), so a
 * technical explanation is never marked down for lacking an outcome, and a
 * story is never marked down for lacking technical accuracy.
 *
 * STAR is deliberately not a dimension. It is one good way to tell a story;
 * the rubric scores what a story shows (contribution, reasoning, outcome)
 * however the candidate orders it.
 */
export type Dimension =
  | "relevance"
  | "specificity"
  | "ownership"
  | "reasoning"
  | "outcome"
  | "accuracy"
  | "communication";

export const DIMENSIONS: readonly Dimension[] = [
  "relevance",
  "specificity",
  "ownership",
  "reasoning",
  "outcome",
  "accuracy",
  "communication",
] as const;

/**
 * The rubric before 2026-10: four separate STAR components plus Impact.
 * Turns and sessions persisted then still carry these keys, so they stay
 * readable and displayable; nothing new is ever scored on them.
 */
export type LegacyDimension = "situation" | "task" | "action" | "result" | "impact";

export const LEGACY_DIMENSIONS: readonly LegacyDimension[] = [
  "situation",
  "task",
  "action",
  "result",
  "impact",
] as const;

/** Any key a stored score set may carry. */
export type AnyDimension = Dimension | LegacyDimension;

/** The question level (1-3) a difficulty asks for; anything below 2 is the opening level. */
export function levelFor(difficulty: number): 1 | 2 | 3 {
  return difficulty >= 3 ? 3 : difficulty === 2 ? 2 : 1;
}

/** Display order for any score set, current or legacy. */
export const DISPLAY_DIMENSIONS: readonly AnyDimension[] = [
  "situation",
  "task",
  "action",
  "result",
  ...DIMENSIONS,
  "impact",
] as const;

/**
 * Weight of each dimension per question kind; each row sums to 1.
 *
 * Grounded in structured-interview practice rather than tuned to a target
 * score: what shows the competency (contribution, reasoning, evidence,
 * correctness) carries the weight. Communication is kept light because a
 * speech transcript is a noisy signal of it, and it must never become a proxy
 * for accent or grammar. Ref: docs/Scoring-Rubric.md
 */
export const WEIGHTS: Record<QuestionKind, Partial<Record<Dimension, number>>> = {
  behavioral: {
    relevance: 0.15,
    specificity: 0.2,
    ownership: 0.2,
    reasoning: 0.25,
    outcome: 0.15,
    communication: 0.05,
  },
  resume: {
    relevance: 0.15,
    specificity: 0.2,
    ownership: 0.2,
    reasoning: 0.25,
    outcome: 0.15,
    communication: 0.05,
  },
  technical: {
    relevance: 0.15,
    accuracy: 0.35,
    reasoning: 0.25,
    specificity: 0.15,
    communication: 0.1,
  },
  problem_solving: {
    relevance: 0.1,
    reasoning: 0.35,
    accuracy: 0.2,
    specificity: 0.2,
    communication: 0.15,
  },
  motivational: {
    relevance: 0.25,
    specificity: 0.35,
    reasoning: 0.25,
    communication: 0.15,
  },
};

/** The dimensions a kind is scored on, in DIMENSIONS order. */
export function dimensionsFor(kind: QuestionKind): Dimension[] {
  return DIMENSIONS.filter((d) => WEIGHTS[kind][d] !== undefined);
}

/**
 * Never chased by a follow-up and never the reason an answer misses `great`:
 * "speak more clearly" is not an interview question, and a transcript is too
 * noisy a signal of delivery to gate a band on.
 */
export const NEVER_A_GAP: ReadonlySet<Dimension> = new Set(["communication"]);

/**
 * Tie-break order for `primary_gap`, computed in code so it never drifts from
 * the scores. Ordered by what a follow-up most usefully adds: the candidate's
 * own part and correctness first, then their reasoning and the outcome.
 * Ownership and accuracy never apply to the same kind, so never compete.
 */
export const GAP_PRIORITY: readonly Dimension[] = [
  "ownership",
  "accuracy",
  "reasoning",
  "outcome",
  "specificity",
  "relevance",
] as const;

/** One answer's scores, 1-4: only the dimensions its kind is scored on. */
export type Scores = Partial<Record<Dimension, number>>;

/** A persisted score set, which may predate the current rubric. */
export type StoredScores = Partial<Record<AnyDimension, number>>;

/** True when a stored score set was written by the pre-2026-10 STAR rubric. */
export function isLegacyScores(scores: StoredScores): boolean {
  return typeof scores.situation === "number";
}

/**
 * The single figure an answer's band and every headline number are built
 * from: the kind's weighted mean over the dimensions present. Dividing by the
 * weight actually present stops a missing dimension counting as zero.
 *
 * Legacy rows keep the formula they were banded with (the STAR roll-up beside
 * four other dimensions), so an old session's numbers do not move.
 */
export function weightedScore(
  scores: StoredScores,
  kind: QuestionKind,
): number | null {
  if (isLegacyScores(scores)) return legacyScore(scores);

  let total = 0;
  let weight = 0;
  for (const d of DIMENSIONS) {
    const w = WEIGHTS[kind][d];
    const s = scores[d];
    if (w === undefined || typeof s !== "number") continue;
    total += w * s;
    weight += w;
  }
  // Rounded so float noise cannot move a band: an answer worth exactly 3.5
  // must not come out as 3.4999999999999996 and miss `great`.
  return weight > 0 ? Math.round((total / weight) * 1e6) / 1e6 : null;
}

function legacyScore(s: StoredScores): number | null {
  const star = ["situation", "task", "action", "result"] as const;
  const values = [
    star.reduce((sum, d) => sum + (s[d] ?? 0), 0) / star.length,
    s.specificity,
    s.impact,
    s.ownership,
    s.relevance,
  ].filter((v): v is number => typeof v === "number");
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// Each list is declared once; the types, the request schemas and the row
// readers all derive from it, so a new value can't be accepted in one place
// and rejected in another.

/** Answer quality band. Drives the next move. */
export const BANDS = ["weak", "mediocre", "great"] as const;
export type Band = (typeof BANDS)[number];

/** What kind of question was asked. Mirrors `turns.question_type`. */
export const QUESTION_TYPES = ["opening", "deepen", "clarify"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** A clarify or deepen adds to the question before it; only an opening starts one. */
export const isFollowUpType = (type: QuestionType) => type !== "opening";

/** Where a question came from, so the policy can alternate like a real screen. */
export const QUESTION_SOURCES = ["bank", "resume"] as const;
export type QuestionSource = (typeof QUESTION_SOURCES)[number];

/** Quick: bank-led and bounded. Full: covers every role and project. */
export const INTERVIEW_MODES = ["quick", "full"] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];

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

/** Where an interview stands, as the turn route and the room report it. */
export function progressOf(state: EngineState) {
  const items = state.resumeItems ?? [];
  return {
    questionCount: state.questionCount,
    questionCap: state.questionCap,
    topicIndex: state.topicIndex,
    // Optional for engine states saved before topics were stored.
    topicsTotal: state.topics?.length,
    coverageDone: items.filter((i) => i.covered).length,
    coverageTotal: items.length,
  };
}

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
