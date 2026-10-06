/**
 * The adaptive state machine — the kernel. Every next move is decided here;
 * the model only ever supplies WORDING, which is validated and replaceable by
 * a bank seed.
 *
 * `step()` is pure: no I/O, no Date.now(), no Math.random(). Randomness lives
 * in `initState()`, captured into `topics` and never re-rolled, so a session
 * survives a refresh and a scripted run repeats exactly.
 *
 * Ref: PRD > Adaptive Engine
 */

import { noDimensionRose } from "./classify";
import {
  FULL_BANK_THREADS,
  QUICK_QUESTION_CAP,
  TURNS_PER_RESUME_THREAD,
  fullModeCap,
  maxCoverableItems,
  type Band,
  type Dimension,
  type EngineState,
  type InterviewMode,
  type Move,
  type Question,
  type QuestionSource,
  type ResumeItem,
  type Scores,
  type TopicId,
} from "./types";

export const MAX_FOLLOW_UPS = 2;
/** Full-mode resume threads: see maxFollowUpsFor. */
export const MAX_FOLLOW_UPS_FULL_RESUME = 1;
export const MAX_DIFFICULTY = 3;

/** What `step()` needs about the answer just given. */
export interface StepInput {
  scores: Scores;
  band: Band;
  primaryGap: Dimension;
  /** The follow-up restated the previous answer instead of expanding it. */
  repeatsPrevious?: boolean;
}

/** `next` is null only when `move === 'wrap'`. */
export interface StepResult {
  state: EngineState;
  move: Move;
  /**
   * What the next question must be about. The caller resolves it to text, then
   * writes it back with `commitQuestion()`.
   */
  next: NextQuestionSpec | null;
}

export interface NextQuestionSpec {
  source: QuestionSource;
  type: "opening" | "deepen" | "clarify";
  topic: TopicId;
  difficulty: number;
  /** Set when `source === 'resume'`. */
  resumeItem?: ResumeItem;
  /** Set for a clarify: what the follow-up should chase. */
  gap?: Dimension;
}

export interface InitArgs {
  mode: InterviewMode;
  topics: TopicId[];
  /** Ranked most relevant to the target role first. */
  resumeItems: ResumeItem[];
  firstQuestion: Question;
}

export function initState(args: InitArgs): EngineState {
  const all = args.resumeItems.map((i) => ({ ...i, covered: false }));

  /**
   * A resume with more items than the cap can reach is trimmed HERE, to the
   * best-matching ones, rather than carried and quietly left uncovered.
   *
   * The alternative is a session that reports twelve items to cover, covers
   * ten, and wraps - which reads as a bug and breaks the promise the mode
   * exists to make. Trimming keeps `coverageTotal` honest; the items are
   * already ranked against the job description, so what survives is what
   * matters most for this application. The caller reports the difference.
   */
  const items =
    args.mode === "full" ? all.slice(0, maxCoverableItems()) : all;
  return {
    mode: args.mode,
    topics: args.topics,
    topicIndex: 0,
    difficulty: 1,
    followUpsUsed: 0,
    lastMove: "opening",
    lastBand: null,
    threadScores: [],
    questionCount: 1,
    questionCap:
      args.mode === "quick" ? QUICK_QUESTION_CAP : fullModeCap(items.length),
    turnSeq: 0,
    currentQuestion: args.firstQuestion,
    askedQuestions: [args.firstQuestion.text],
    resumeItems: items,
    resumeItemIndex: 0,
    lastQuestionSource: args.firstQuestion.source,
    done: false,
  };
}

/** True when a follow-up added nothing measurable. */
export function isPlateau(state: EngineState, input: StepInput): boolean {
  if (state.lastMove === "opening") return false;
  if (input.repeatsPrevious) return true;
  const previous = state.threadScores[state.threadScores.length - 1];
  if (!previous) return false;
  return noDimensionRose(previous, input.scores);
}

/** Should this thread end? Ref: PRD > Adaptive Engine (resolution rules) */
/**
 * Follow-ups this thread may spend.
 *
 * A full-mode resume thread gets one, not two. Full mode promises to cover
 * every role and project, and measurement showed a second follow-up on each
 * put six items 36 turns out of reach. Breadth over depth is the distinction
 * between the modes: quick mode still digs the full two.
 */
export function maxFollowUpsFor(state: EngineState): number {
  return state.mode === "full" && state.currentQuestion.source === "resume"
    ? MAX_FOLLOW_UPS_FULL_RESUME
    : MAX_FOLLOW_UPS;
}

export function shouldResolveTopic(
  state: EngineState,
  input: StepInput,
): boolean {
  if (state.followUpsUsed >= maxFollowUpsFor(state)) return true;
  if (isPlateau(state, input)) return true;
  if (state.lastMove === "deepen" && input.band === "great") return true;
  if (
    state.lastMove === "clarify" &&
    state.lastBand === "weak" &&
    input.band === "weak"
  ) {
    return true;
  }
  return false;
}

/** Items still owed at least one question, in ranked order. */
export function uncovered(state: EngineState): ResumeItem[] {
  return state.resumeItems.filter((i) => !i.covered);
}

/**
 * Resume item or bank question next? A real screen alternates, so the default
 * is "not what we did last time". Full mode overrides that when short on
 * budget — coverage is the mode's promise, and it outranks variety.
 */
export function nextSource(state: EngineState): QuestionSource {
  const remaining = uncovered(state);
  if (remaining.length === 0) return "bank";

  // No bank topic left to advance to. `topicIndex` is the LAST used index, so
  // the guard is against length - 1; comparing against length let the caller
  // pick bank, find nothing, and wrap with items still uncovered.
  if (state.topicIndex >= state.topics.length - 1) return "resume";

  if (state.mode === "full") {
    // Bank threads are a fixed budget here, not an alternating half of the
    // interview. `topicIndex` counts the bank threads already opened.
    if (state.topicIndex + 1 >= FULL_BANK_THREADS) return "resume";

    // Even inside the budget, coverage wins once the remaining turns would
    // not otherwise fit every uncovered item.
    const questionsLeft = state.questionCap - state.questionCount;
    if (questionsLeft <= remaining.length * TURNS_PER_RESUME_THREAD) {
      return "resume";
    }
  }

  return state.lastQuestionSource === "resume" ? "bank" : "resume";
}

/** Marks the item the current thread was about as covered. */
function markCurrentCovered(state: EngineState): ResumeItem[] {
  const id = state.currentQuestion.resumeItemId;
  if (!id) return state.resumeItems;
  return state.resumeItems.map((i) =>
    i.id === id ? { ...i, covered: true } : i,
  );
}

/**
 * Nothing left to ask. Full mode will not wrap while an item is uncovered —
 * that is the mode — unless the cap is hit, the backstop against a
 * pathological resume producing an endless interview.
 */
export function shouldWrap(state: EngineState): boolean {
  if (state.questionCount >= state.questionCap) return true;

  const remaining = uncovered(state);
  if (state.mode === "full" && remaining.length > 0) return false;

  const topicsLeft = state.topicIndex < state.topics.length - 1;
  return !topicsLeft && remaining.length === 0;
}

export function step(state: EngineState, input: StepInput): StepResult {
  // Record first, so the next turn's plateau check compares like with like.
  const threadScores = [...state.threadScores, input.scores];
  const turnSeq = state.turnSeq + 1;

  const base: EngineState = {
    ...state,
    threadScores,
    turnSeq,
    lastBand: input.band,
  };

  const resolving = shouldResolveTopic(state, input);

  // ---- continue the current thread ---------------------------------------
  if (!resolving) {
    // Checked BEFORE issuing a follow-up: never start what we cannot finish.
    if (base.questionCount >= base.questionCap) {
      return wrap(base);
    }

    const move: "deepen" | "clarify" =
      input.band === "great" ? "deepen" : "clarify";

    return {
      state: {
        ...base,
        followUpsUsed: (base.followUpsUsed + 1) as 0 | 1 | 2,
        lastMove: move,
        questionCount: base.questionCount + 1,
      },
      move,
      next: {
        source: base.currentQuestion.source,
        type: move,
        topic: base.currentQuestion.topic,
        difficulty: base.difficulty,
        resumeItem: base.resumeItems.find(
          (i) => i.id === base.currentQuestion.resumeItemId,
        ),
        gap: move === "clarify" ? input.primaryGap : undefined,
      },
    };
  }

  // ---- resolve the thread and move on ------------------------------------
  const resumeItems = markCurrentCovered(base);
  const difficulty =
    input.band === "great"
      ? (Math.min(MAX_DIFFICULTY, base.difficulty + 1) as 1 | 2 | 3)
      : base.difficulty;

  const resolved: EngineState = {
    ...base,
    resumeItems,
    difficulty,
    followUpsUsed: 0,
    threadScores: [],
  };

  if (shouldWrap(resolved)) return wrap(resolved);

  const source = nextSource(resolved);

  if (source === "resume") {
    const item = uncovered(resolved)[0];
    if (item) return openResumeThread(resolved, item);
  }

  // ---- next bank topic ---------------------------------------------------
  const topicIndex = resolved.topicIndex + 1;
  if (topicIndex >= resolved.topics.length) {
    // Out of bank topics. Running out of VARIETY must not end an interview
    // that still owes the candidate coverage, so fall back to the next item
    // rather than wrapping. Without this, coverage silently capped at the
    // number of bank topics however large the resume or the cap.
    const fallback = uncovered(resolved)[0];
    if (fallback) return openResumeThread(resolved, fallback);
    return wrap(resolved);
  }

  return {
    state: {
      ...resolved,
      topicIndex,
      lastMove: "opening",
      lastQuestionSource: "bank",
      questionCount: resolved.questionCount + 1,
    },
    move: "opening",
    next: {
      source: "bank",
      type: "opening",
      topic: resolved.topics[topicIndex],
      difficulty: resolved.difficulty,
    },
  };
}

/** Opens a thread about one resume item. Shared by both paths into it. */
function openResumeThread(state: EngineState, item: ResumeItem): StepResult {
  const itemIndex = state.resumeItems.findIndex((i) => i.id === item.id);
  return {
    state: {
      ...state,
      resumeItemIndex: itemIndex,
      lastMove: "opening",
      lastQuestionSource: "resume",
      questionCount: state.questionCount + 1,
    },
    move: "opening",
    next: {
      source: "resume",
      type: "opening",
      // Still belongs to a competency, for the notepad and difficulty.
      topic: state.topics[state.topicIndex] ?? state.topics[0],
      difficulty: state.difficulty,
      resumeItem: item,
    },
  };
}

function wrap(state: EngineState): StepResult {
  return {
    state: { ...state, done: true, lastMove: state.lastMove },
    move: "wrap",
    next: null,
  };
}

/**
 * Writes the chosen question text back into state. Separate from `step()`
 * because resolving the text may need a model call, and `step()` stays pure.
 */
export function commitQuestion(
  state: EngineState,
  question: Question,
): EngineState {
  return {
    ...state,
    currentQuestion: question,
    askedQuestions: [...state.askedQuestions, question.text],
  };
}
