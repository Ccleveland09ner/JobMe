/** Zod schemas for every request body and the stored question plan. */

import { z } from "zod";

import { TOPIC_IDS, type TopicId } from "./engine/types";

/** Input caps. */
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
    /** ...or a posting link (lib/job-posting.ts). Scheme-checked: .url() accepts javascript: URLs. */
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

/** The stored question plan, parsed on every load (a malformed plan falls back to the bank). */
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
  /** Time the recognizer actually captured, summed across restarts; wpm uses this. */
  captureMs: z.number().int().nonnegative().optional(),
  /** Must equal state.turnSeq + 1; a mismatch (double submit, stale client) gets a 409. */
  clientTurnSeq: z.number().int().nonnegative(),
});
export type TurnBody = z.infer<typeof TurnBody>;

/** A [id] route segment, checked first so a malformed uuid is the same 404 as a missing one. */
export const SessionId = z.string().uuid();

export const TtsQuery = z.object({
  text: z.string().min(1).max(LIMITS.ttsText),
});
