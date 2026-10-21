/**
 * The adaptive state machine: every next move is decided here; the model only
 * supplies wording. step() is pure (no I/O, clock or randomness), so a session
 * survives a refresh and a scripted run repeats exactly.
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
  /** What the next question must be about; the caller resolves the text and commits it. */
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
   * Items beyond what the cap can reach are trimmed here, keeping the best
   * matches, so coverageTotal stays honest. The caller reports the difference.
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

/** Should this thread end? */
/** Follow-ups this thread may spend: one for a full-mode resume thread (breadth), else two. */
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

/** Resume item or bank question next? Alternate, unless full mode is short on budget for coverage. */
export function nextSource(state: EngineState): QuestionSource {
  const remaining = uncovered(state);
  if (remaining.length === 0) return "bank";

  // No bank topic left (topicIndex is the last used index, hence length - 1).
  if (state.topicIndex >= state.topics.length - 1) return "resume";

  if (state.mode === "full") {
    // Bank threads are a fixed budget here; topicIndex counts those opened.
    if (state.topicIndex + 1 >= FULL_BANK_THREADS) return "resume";

    // Coverage wins once the remaining turns couldn't otherwise fit every item.
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

/** Nothing left to ask. Full mode won't wrap with an item uncovered, unless the cap is hit. */
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

  // Continue the current thread.
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

  // Resolve the thread and move on.
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

  // Next bank topic.
  const topicIndex = resolved.topicIndex + 1;
  if (topicIndex >= resolved.topics.length) {
    // Out of bank topics: fall back to the next uncovered item rather than wrapping.
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

/** Writes the chosen question text into state (outside step(), which stays pure). */
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
