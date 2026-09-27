/**
 * Zod schemas: validates every request body, and the stored question plan,
 * before either reaches the engine.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > API Contracts, > Security
 */

import { z } from "zod";

import { TOPIC_IDS, type TopicId } from "./engine/types";

/** Input caps. Ref: docs/TechDesign-JobMe-MVP.md > Security */
export const LIMITS = {
  transcript: 5000,
  roleText: 2000,
  ttsText: 600,
  displayName: 40,
  targetRole: 100,
  jobUrl: 500,
} as const;

export const CreateSessionBody = z
  .object({
    displayName: z.string().trim().min(1).max(LIMITS.displayName),
    /** The job title, e.g. "Backend Engineering Intern". */
    targetRole: z.string().trim().min(1).max(LIMITS.targetRole).optional(),
    /** A pasted job description... */
    roleText: z.string().max(LIMITS.roleText).optional(),
    /**
     * ...or a link to the posting, read by lib/job-posting.ts. Scheme-checked
     * here because `z.string().url()` accepts `javascript:` URLs.
     */
    jobUrl: z
      .string()
      .trim()
      .max(LIMITS.jobUrl)
      .regex(/^https?:\/\//i, "Must be a web link")
      .optional(),
    resumeId: z.string().uuid().optional(),
    mode: z.enum(["quick", "full"]).default("quick"),
  })
  .refine((b) => !(b.roleText?.trim() && b.jobUrl), {
    message: "Give either a pasted job description or a link, not both.",
    path: ["jobUrl"],
  });
export type CreateSessionBody = z.infer<typeof CreateSessionBody>;

const Topic = z.enum(TOPIC_IDS as unknown as [TopicId, ...TopicId[]]);

/**
 * The interview prepared at session start (lib/ai/question-plan.ts), stored
 * as `interview_sessions.question_plan`. Parsed on every load rather than
 * trusted, so a malformed plan degrades to the fixed bank text instead of
 * breaking a turn.
 */
export const QuestionPlan = z.object({
  version: z.literal(1),
  /** RoleProfile-shaped, so `formatRoleForPrompt()` can render it per turn. */
  role: z
    .object({
      title: z.string(),
      seniority: z.string(),
      requiredSkills: z.array(z.string()),
      responsibilities: z.array(z.string()),
      competencies: z.array(z.string()),
    })
    .nullable(),
  /** Role-tailored wording for SOME bank topics, per difficulty level. */
  topics: z.partialRecord(
    Topic,
    z.object({
      l1: z.string().optional(),
      l2: z.string().optional(),
      l3: z.string().optional(),
    }),
  ),
  /** One opening per resume item, keyed by item id. */
  resume: z.record(
    z.string(),
    z.object({ text: z.string(), topic: Topic.nullable() }),
  ),
});
export type QuestionPlan = z.infer<typeof QuestionPlan>;

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
