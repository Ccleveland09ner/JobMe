/** Zod schemas for every request body and the stored question plan. */

import { z } from "zod";

import { ROLE_FAMILIES } from "./engine/roles";
import { INTERVIEW_MODES, TOPIC_IDS, type TopicId } from "./engine/types";

/** Input caps. */
export const LIMITS = {
  transcript: 5000,
  /**
   * Matches what a posting link yields (lib/job-posting.ts MAX_POSTING_CHARS).
   * It was 2000, which silently cut most real job descriptions to their first
   * third — usually the company blurb, before the requirements.
   */
  roleText: 8000,
  ttsText: 600,
  displayName: 40,
  targetRole: 100,
  company: 100,
  jobUrl: 500,
} as const;

export const CreateSessionBody = z
  .object({
    displayName: z.string().trim().min(1).max(LIMITS.displayName),
    /** The job title, e.g. "Backend Engineering Intern". */
    targetRole: z.string().trim().min(1).max(LIMITS.targetRole).optional(),
    /** The employer, when the candidate knows it. Never required. */
    company: z.string().trim().min(1).max(LIMITS.company).optional(),
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
    mode: z.enum(INTERVIEW_MODES).default("quick"),
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
  /** Role-tailored wording for the session's topics, per difficulty level. */
  topics: z.partialRecord(
    Topic,
    z.object({
      l1: z.string().optional(),
      l2: z.string().optional(),
      l3: z.string().optional(),
      /** What the topic assesses for this job, shown on the scorecard. */
      purpose: z.string().optional(),
    }),
  ),
  /** One opening per resume item, keyed by item id. */
  resume: z.record(
    z.string(),
    z.object({ text: z.string(), topic: Topic.nullable() }),
  ),
  /** The session's topics in ask order. Absent on plans stored before 2026-10. */
  order: z.array(Topic).optional(),
  /** Resume item ids, most relevant to this job first. */
  resumeOrder: z.array(z.string()).optional(),
  /**
   * The job, stored even when the model contributed nothing, so every turn
   * knows the role and the level it is judging against.
   */
  job: z
    .object({
      title: z.string().nullable(),
      company: z.string().nullable(),
      /** Read from the posting link's path, not stated by the posting. */
      companyInferred: z.boolean(),
      family: z.enum(ROLE_FAMILIES),
      seniority: z.string().nullable(),
      /** The model contributed to this plan — what "personalised" means. */
      generated: z.boolean(),
    })
    .optional(),
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
