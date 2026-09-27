/**
 * The adaptive state machine. This is the kernel: it decides every next move,
 * and no AI output is ever allowed to decide one.
 *
 * Ref: docs/PRD-JobMe-MVP.md > Adaptive Engine
 *
 * `step()` is pure — no I/O, no Date.now(), no Math.random(). Randomness lives
 * in `initState()`, where it is captured into `EngineState.topics` and never
 * re-rolled, so a session survives a refresh and a scripted run is repeatable.
 *
 * The model's only influence is the WORDING of a follow-up, and even that is
 * validated and can be replaced by a bank seed. Which move happens, which
 * topic comes next, whether the interview ends — all decided here.
 */

import { noDimensionRose } from "./classify";
import {
  QUICK_QUESTION_CAP,
  fullModeCap,
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
export const MAX_DIFFICULTY = 3;

/** What `step()` needs to know about the answer just given. */
export interface StepInput {
  scores: Scores;
  band: Band;
  primaryGap: Dimension;
  /** The follow-up restated the previous answer instead of expanding it. */
  repeatsPrevious?: boolean;
}

/** What `step()` decided. `question` is null only when `move === 'wrap'`. */
export interface StepResult {
  state: EngineState;
  move: Move;
  /**
   * Which item the next question must be about. The caller turns this into
   * text — from the bank for `bank`, or via the resume question generator for
   * `resume` — then writes it back with `commitQuestion()`.
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
  /** Ranked most-relevant-to-the-target-role first. */
  resumeItems: ResumeItem[];
  firstQuestion: Question;
}

export function initState(args: InitArgs): EngineState {
  const items = args.resumeItems.map((i) => ({ ...i, covered: false }));
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

/**
 * Should this thread end?
 *
 * Ref: docs/PRD-JobMe-MVP.md > Adaptive Engine (resolution rules)
 */
export function shouldResolveTopic(
  state: EngineState,
  input: StepInput,
): boolean {
  if (state.followUpsUsed >= MAX_FOLLOW_UPS) return true;
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
 * Whether the next thread should open on a resume item or a bank question.
 *
 * A real screen alternates — the interviewer has read your resume but is also
 * working through their own list — so the default is simply "not what we did
 * last time". Full mode overrides that when it is running out of room: an
 * uncovered item outranks variety, because coverage is the mode's promise.
 */
export function nextSource(state: EngineState): QuestionSource {
  const remaining = uncovered(state);
  if (remaining.length === 0) return "bank";
  if (state.topicIndex >= state.topics.length) return "resume";

  if (state.mode === "full") {
    const questionsLeft = state.questionCap - state.questionCount;
    // Two questions per item is the budget full mode was sized against; below
    // that, stop alternating and spend everything on coverage.
    if (questionsLeft <= remaining.length * 2) return "resume";
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
 * True when the interview has nothing left to ask.
 *
 * Full mode will NOT wrap while a resume item is uncovered — that is the whole
 * point of the mode — unless the cap has been reached, which is the backstop
 * that stops a pathological resume producing an endless interview.
 */
export function shouldWrap(state: EngineState): boolean {
  if (state.questionCount >= state.questionCap) return true;

  const remaining = uncovered(state);
  if (state.mode === "full" && remaining.length > 0) return false;

  const topicsLeft = state.topicIndex < state.topics.length - 1;
  return !topicsLeft && remaining.length === 0;
}

export function step(state: EngineState, input: StepInput): StepResult {
  // Record the answer against the current thread before anything else, so the
  // plateau check on the NEXT turn compares like with like.
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
    // The cap is checked BEFORE issuing a follow-up: an interview that has run
    // out of room must wrap rather than start something it cannot finish.
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
    if (item) {
      const itemIndex = resolved.resumeItems.findIndex((i) => i.id === item.id);
      return {
        state: {
          ...resolved,
          resumeItemIndex: itemIndex,
          lastMove: "opening",
          lastQuestionSource: "resume",
          questionCount: resolved.questionCount + 1,
        },
        move: "opening",
        next: {
          source: "resume",
          type: "opening",
          // A resume-led question still belongs to a competency, for the
          // notepad and for difficulty. The generator may refine it.
          topic: resolved.topics[resolved.topicIndex] ?? resolved.topics[0],
          difficulty: resolved.difficulty,
          resumeItem: item,
        },
      };
    }
  }

  // ---- next bank topic ---------------------------------------------------
  const topicIndex = resolved.topicIndex + 1;
  if (topicIndex >= resolved.topics.length) return wrap(resolved);

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

function wrap(state: EngineState): StepResult {
  return {
    state: { ...state, done: true, lastMove: state.lastMove },
    move: "wrap",
    next: null,
  };
}

/**
 * Writes the chosen question text back into the state.
 *
 * Separate from `step()` because producing the text may require a model call
 * (a resume-led opening, a drafted follow-up), and `step()` must stay pure and
 * synchronous. The caller resolves the text, then commits it here.
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
