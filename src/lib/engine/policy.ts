/**
 * The adaptive state machine. This is the kernel: it decides every next move,
 * and no AI output is ever allowed to decide it.
 *
 * TODO(slice 2): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > Adaptive Engine > policy.ts
 *      docs/PRD-JobMe-MVP.md > Adaptive Engine
 *
 * Resolve the current topic if ANY of:
 *   - followUpsUsed === 2
 *   - this was a follow-up AND no dimension rose by >= 1 vs. the previous
 *     answer in the thread (plateau)
 *   - lastMove === 'deepen' AND band === 'great'
 *   - lastMove === 'clarify' after a weak AND band === 'weak'
 *
 * Not resolved:
 *   great               -> deepen  (drafts.deepen, else seeds.deepen)
 *   mediocre | weak     -> clarify aimed at primaryGap
 *                          (drafts.clarify, else seeds.clarify[primaryGap])
 *
 * Resolved:
 *   thread ended great  -> difficulty = min(3, difficulty + 1)
 *   advance to next topic, ask its opening at the current difficulty
 *   no topics left OR questionCount >= 10 -> wrap
 *
 * The hard cap is checked BEFORE issuing any follow-up.
 */

import type { EngineState, Evaluation, Question, StepResult, TopicId } from "./types";

/** Build the starting state for a new session. */
export function initState(topics: TopicId[]): EngineState {
  void topics;
  throw new Error("TODO(slice 2): initState not implemented");
}

/** The whole decision. Pure: same inputs, same outputs, every time. */
export function step(state: EngineState, evaluation: Evaluation): StepResult {
  void state;
  void evaluation;
  throw new Error("TODO(slice 2): step not implemented");
}

/** True when a follow-up raised no dimension by >= 1 against the prior answer. */
export function isPlateau(state: EngineState, evaluation: Evaluation): boolean {
  void state;
  void evaluation;
  throw new Error("TODO(slice 2): isPlateau not implemented");
}

export const QUESTION_CAP = 10;
export const TOPICS_PER_SESSION = 4;
export const MAX_FOLLOW_UPS = 2;

export type { Question };
