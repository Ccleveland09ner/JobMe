/**
 * Starting an interview: its topics, its question plan (one time-boxed model
 * call when there is anything to personalise; the bank's fixed text if it
 * fails), the first question, and the engine's opening state, saved as a new
 * session. Storage, the posting fetch, the model and the topic draw come in
 * as dependencies (the route wires the real ones).
 */

import { plannedBankOpening, QUICK_PLAN_RESUME_ITEMS, type PlanInputs } from "../ai/question-plan";
import { questionFor } from "../engine/bank";
import { initState } from "../engine/policy";
import type { EngineState, Question, ResumeItem, TopicId } from "../engine/types";
import { formatRoleForPrompt, type RoleProfile } from "../jd/distill";
import { JobLinkError, type JobPosting } from "../job-posting";
import { formatFactsForPrompt } from "../resume/distill";
import type { ResumeFacts } from "../resume/store";
import { LIMITS, type CreateSessionBody, type QuestionPlan } from "../schemas";

/** Drawn from a bank of 11: this is where session-to-session variety comes from. */
export const QUICK_TOPICS = 4;
export const FULL_TOPICS = 6;

/** Resume text per item in the plan prompt: enough for a specific question. */
const EXCERPT_CHARS = 600;

/** A resume as the plan reads it: coverage ranked at ingest, plus its chunks. */
export interface StartResume {
  coverage_items: unknown;
  resume_facts: unknown;
  role_profile: unknown;
  resume_chunks: { seq: number; content: string }[] | null;
}

/** The new `interview_sessions` row. */
export interface NewSession {
  role_text: string | null;
  job_url: string | null;
  question_plan: QuestionPlan | null;
  resume_id: string | null;
  engine_state: EngineState;
  question_count: number;
}

export interface StartStore {
  /** Remembers the name and target role for next time; its outcome doesn't matter. */
  saveProfile(patch: { display_name: string; target_role: string | undefined }): Promise<unknown>;
  /** The chosen resume, or null when it can't be read. */
  loadResume(id: string): Promise<StartResume | null>;
  /** The new session's id, or why it couldn't be saved (for the log). */
  insertSession(row: NewSession): Promise<{ id: string } | { error: string }>;
}

export interface StartDeps {
  store: StartStore;
  fetchPosting: (url: string) => Promise<JobPosting>;
  generatePlan: (inputs: PlanInputs) => Promise<QuestionPlan | null>;
  pickTopics: (count: number) => TopicId[];
}

export type StartOutcome =
  | {
      kind: "created";
      sessionId: string;
      state: EngineState;
      firstQuestion: Question;
      plan: QuestionPlan | null;
      /** What was read from the posting link, if one was given. */
      posting: JobPosting | null;
      /** Every resume item, before the engine trims what a full interview can't reach. */
      coverageTotal: number;
    }
  /** The posting link can't be read: an error to show, never silently ignored. */
  | { kind: "bad-link"; error: JobLinkError }
  | { kind: "failed"; reason: string };

/**
 * Creates the session. A posting fetch that fails for any reason other than
 * the link itself is thrown, as before: a server error, not the user's.
 */
export async function startInterview(body: CreateSessionBody, deps: StartDeps): Promise<StartOutcome> {
  const { store } = deps;

  // The reads and the profile write in one round trip (chunks let the plan quote the resume).
  const [, resumeRes, postingRes] = await Promise.allSettled([
    store.saveProfile({ display_name: body.displayName, target_role: body.targetRole ?? body.roleText }),
    body.resumeId ? store.loadResume(body.resumeId) : Promise.resolve(null),
    body.jobUrl ? deps.fetchPosting(body.jobUrl) : Promise.resolve(null),
  ]);

  if (postingRes.status === "rejected") {
    if (postingRes.reason instanceof JobLinkError) return { kind: "bad-link", error: postingRes.reason };
    throw postingRes.reason;
  }
  const posting = postingRes.value;

  // Ranked at ingest. Full mode without a resume becomes a longer bank-led interview.
  const resume = resumeRes.status === "fulfilled" ? resumeRes.value : null;
  const resumeItems = (resume?.coverage_items ?? []) as ResumeItem[];
  const chunks = resume?.resume_chunks ?? [];

  const topics = deps.pickTopics(body.mode === "full" ? FULL_TOPICS : QUICK_TOPICS);
  const jobText = posting?.text ?? body.roleText ?? null;

  // Quick mode plans only a few resume threads; later ones get the fixed opening.
  const planItems = body.mode === "full" ? resumeItems : resumeItems.slice(0, QUICK_PLAN_RESUME_ITEMS);

  const plan = await deps.generatePlan({
    topics,
    resumeItems: planItems.map((item) => ({ item, excerpt: excerptFor(item, chunks) })),
    targetRole: body.targetRole ?? posting?.title ?? null,
    company: posting?.company ?? null,
    jobText,
    roleSummary: resume?.role_profile ? formatRoleForPrompt(resume.role_profile as RoleProfile) : null,
    resumeFacts: resume?.resume_facts ? formatFactsForPrompt(resume.resume_facts as ResumeFacts) : null,
  });

  const firstQuestion: Question = {
    text: plannedBankOpening(plan, topics[0], 1, []) ?? questionFor(topics[0], 1),
    type: "opening",
    topic: topics[0],
    difficulty: 1,
    source: "bank",
  };
  const state = initState({ mode: body.mode, topics, resumeItems, firstQuestion });

  const saved = await store.insertSession({
    // Capped as if pasted; the plan's role summary is what turns use.
    role_text: jobText ? jobText.slice(0, LIMITS.roleText) : null,
    job_url: body.jobUrl ?? null,
    question_plan: plan,
    resume_id: body.resumeId ?? null,
    engine_state: state,
    question_count: state.questionCount,
  });
  if ("error" in saved) return { kind: "failed", reason: saved.error };

  return { kind: "created", sessionId: saved.id, state, firstQuestion, plan, posting, coverageTotal: resumeItems.length };
}

/** The resume text behind an item, from the chunks it was built from. */
export function excerptFor(item: ResumeItem, chunks: { seq: number; content: string }[]): string {
  const text = chunks
    .filter((c) => item.chunkSeqs.includes(c.seq))
    .sort((a, b) => a.seq - b.seq)
    .map((c) => c.content.replace(/\s+/g, " ").trim())
    .join(" ")
    .slice(0, EXCERPT_CHARS);
  return text || item.label;
}
