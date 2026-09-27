/**
 * Zod schemas: validates every request body before it reaches the engine.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > API Contracts, > Security
 */

import { z } from "zod";

/** Input caps. Ref: docs/TechDesign-JobMe-MVP.md > Security */
export const LIMITS = {
  transcript: 5000,
  roleText: 2000,
  ttsText: 600,
  displayName: 40,
} as const;

export const CreateSessionBody = z.object({
  displayName: z.string().trim().min(1).max(LIMITS.displayName),
  roleText: z.string().max(LIMITS.roleText).optional(),
  resumeId: z.string().uuid().optional(),
  mode: z.enum(["quick", "full"]).default("quick"),
});
export type CreateSessionBody = z.infer<typeof CreateSessionBody>;

export const TurnBody = z.object({
  transcript: z.string().min(1).max(LIMITS.transcript),
  /** How long the talk button was held, including thinking pauses. */
  holdMs: z.number().int().nonnegative(),
  /**
   * How long the recognizer was actually capturing, summed across restarts.
   * `wpm` is computed over this, not hold time — hold time under-reports
   * speaking rate by 20-40% on a considered answer.
   */
  captureMs: z.number().int().nonnegative().optional(),
  /**
   * Must equal `state.turnSeq + 1`. A mismatch means a double submit or a
   * stale client, and the route answers 409 with the current state rather
   * than recording the turn twice.
   */
  clientTurnSeq: z.number().int().nonnegative(),
});
export type TurnBody = z.infer<typeof TurnBody>;

/**
 * A `[id]` route segment. Checked before querying, because Postgres rejects a
 * malformed uuid with an error rather than zero rows — and the answer to a
 * nonsense id should be the same 404 as a missing one.
 */
export const SessionId = z.string().uuid();

export const TtsQuery = z.object({
  text: z.string().min(1).max(LIMITS.ttsText),
});
