/**
 * Starting an interview, prepared before it starts:
 *   1. the job: title, company, posting text (pasted, or read from a link);
 *   2. role-family defaults (engine/roles.ts): motivation first, the family's
 *      own question second, then behavioural competencies for that family;
 *   3. one time-boxed model call (lib/ai/question-plan.ts) that may re-choose
 *      and re-word those topics for this job and order the resume.
 * If the call fails the session starts on the role defaults with the job
 * context still stored: a rate limit costs polish, never the interview.
 * Storage, the posting fetch, the model and the topic draw come in as
 * dependencies (the route wires the real ones).
 */

import { QUICK_PLAN_RESUME_ITEMS, wantsPlan, type PlanInputs } from "../ai/question-plan";
import { questionFor } from "../engine/bank";
import { greetingLineFor, introLineFor } from "../engine/opening";
import { initState } from "../engine/policy";
import { inferSeniority, roleFamily, type RoleFamily } from "../engine/roles";
import type { EngineState, Question, ResumeItem, TopicId } from "../engine/types";
import { formatRoleForPrompt, type RoleProfile } from "../jd/profile";
import { JobLinkError, type JobPosting } from "../job-posting";
import { formatFactsForPrompt, type ResumeFacts } from "../resume/facts";
import { orderResumeItems, plannedBankOpening, usableJobText } from "../plan";
import type { CreateSessionBody, QuestionPlan } from "../schemas";

/** Bank threads per session, before resume coverage. */
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
  question_plan: QuestionPlan;
  resume_id: string | null;
  engine_state: EngineState;
  question_count: number;
}

export interface StartStore {
  /** Remembers the name, and the job title when one is given; its outcome doesn't matter. */
  saveProfile(patch: { display_name: string; target_role?: string }): Promise<unknown>;
  /** The chosen resume, or null when it can't be read. */
  loadResume(id: string): Promise<StartResume | null>;
  /** The new session's id, or why it couldn't be saved (for the log). */
  insertSession(row: NewSession): Promise<{ id: string } | { error: string }>;
}

export interface StartDeps {
  store: StartStore;
  fetchPosting: (url: string) => Promise<JobPosting>;
  /** Never null: without the model it is the role defaults plus the job. */
  generatePlan: (inputs: PlanInputs) => Promise<QuestionPlan>;
  /** The family's topics in ask order; the draw is random, so it is injected. */
  defaultTopics: (family: RoleFamily, count: number) => TopicId[];
}

export type StartOutcome =
  | {
      kind: "created";
      sessionId: string;
      state: EngineState;
      firstQuestion: Question;
      plan: QuestionPlan;
      /** Spoken first; the candidate's reply to it is answered in the room, never scored. */
      greetingLine: string;
      /** Spoken after the greeting: who is interviewing; says so when job details were given but couldn't be used. */
      introLine: string;
      /** The model tailored the plan; false means the role-family defaults. */
      personalized: boolean;
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
    // The title only: a pasted description doesn't belong in a 100-character title field.
    store.saveProfile({ display_name: body.displayName, ...(body.targetRole && { target_role: body.targetRole }) }),
    body.resumeId ? store.loadResume(body.resumeId) : Promise.resolve(null),
    body.jobUrl ? deps.fetchPosting(body.jobUrl) : Promise.resolve(null),
  ]);

  if (postingRes.status === "rejected") {
    if (postingRes.reason instanceof JobLinkError) return { kind: "bad-link", error: postingRes.reason };
    throw postingRes.reason;
  }
  const posting = postingRes.value;

  // Ranked against the job given at upload; the plan re-orders them for this
  // one. Full mode without a resume becomes a longer bank-led interview.
  const resume = resumeRes.status === "fulfilled" ? resumeRes.value : null;
  const uploadRanked = (resume?.coverage_items ?? []) as ResumeItem[];
  const chunks = resume?.resume_chunks ?? [];

  // The job. A stated company wins over one guessed from a link's board name,
  // and text too short to be a description ("asdf") counts as none.
  const targetRole = body.targetRole ?? (posting?.title || null);
  const company = body.company ?? posting?.company ?? null;
  const companyInferred = !body.company && Boolean(posting?.companyInferred);
  const jobText = usableJobText(posting?.text ?? body.roleText ?? null);
  const family = roleFamily(targetRole, jobText);
  const defaults = deps.defaultTopics(family, body.mode === "full" ? FULL_TOPICS : QUICK_TOPICS);

  // Quick mode plans only a few resume threads; later ones get the fixed opening.
  const planItems = body.mode === "full" ? uploadRanked : uploadRanked.slice(0, QUICK_PLAN_RESUME_ITEMS);

  const planInputs: PlanInputs = {
    topics: defaults,
    family,
    resumeItems: planItems.map((item) => ({ item, excerpt: excerptFor(item, chunks) })),
    targetRole,
    company,
    companyInferred,
    jobText,
    roleSummary: resume?.role_profile ? formatRoleForPrompt(resume.role_profile as RoleProfile) : null,
    resumeFacts: resume?.resume_facts ? formatFactsForPrompt(resume.resume_facts as ResumeFacts) : null,
    seniority: inferSeniority(targetRole, jobText),
  };
  const plan = await deps.generatePlan(planInputs);

  const topics = plan.order?.length ? plan.order : defaults;
  const resumeItems = orderResumeItems(uploadRanked, plan);

  const firstQuestion: Question = {
    text: plannedBankOpening(plan, topics[0], 1, []) ?? questionFor(topics[0], 1),
    type: "opening",
    topic: topics[0],
    difficulty: 1,
    source: "bank",
  };
  const state = initState({ mode: body.mode, topics, resumeItems, firstQuestion });

  const saved = await store.insertSession({
    // The plan's distilled role is what turns use; this is the fallback.
    role_text: jobText,
    job_url: body.jobUrl ?? null,
    question_plan: plan,
    // Only a resume that was read: one that failed, or isn't this user's, would
    // later feed turns facts the plan never had.
    resume_id: resume ? (body.resumeId ?? null) : null,
    engine_state: state,
    question_count: state.questionCount,
  });
  if ("error" in saved) return { kind: "failed", reason: saved.error };

  const personalized = plan.job?.generated === true;
  return {
    kind: "created",
    sessionId: saved.id,
    state,
    firstQuestion,
    plan,
    // Job details were given, so the plan was wanted, but the model couldn't tailor it.
    greetingLine: greetingLineFor(body.displayName),
    introLine: introLineFor({
      family,
      seniority: planInputs.seniority,
      role: targetRole,
      notTailored: wantsPlan(planInputs) && !personalized,
    }),
    personalized,
    posting,
    coverageTotal: resumeItems.length,
  };
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
