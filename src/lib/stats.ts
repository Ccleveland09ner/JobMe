/**
 * Speaking stats, computed in code so they never depend on an AI call.
 *
 * TODO(slice 5): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > Speaking Stats
 */

/** words / (durationMs / 60000), rounded. Hold time includes pauses - fine for MVP. */
export function wpm(text: string, durationMs: number): number {
  void text;
  void durationMs;
  throw new Error("TODO(slice 5): wpm not implemented");
}

/**
 * Best-effort only, and labelled "approximate" in the UI: Chrome's STT usually
 * drops um/uh before we ever see the transcript.
 * Ref: docs/PRD-JobMe-MVP.md > Constraints and Assumptions
 */
export const FILLER_RE =
  /\b(um+|uh+|erm|like|you know|basically|actually|kind of|sort of|i mean)\b/gi;

export function fillerCount(text: string): number {
  void text;
  throw new Error("TODO(slice 5): fillerCount not implemented");
}

/** Under 5 words -> nudge instead of scoring, and don't count it toward the cap. */
export const MIN_ANSWER_WORDS = 5;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
