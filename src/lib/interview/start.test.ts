import { describe, expect, it, vi } from "vitest";

import { fallbackPlan } from "../ai/question-plan";
import { questionFor } from "../engine/bank";
import { FULL_QUESTION_CAP_MAX, type ResumeItem, type TopicId } from "../engine/types";
import { JobLinkError, type JobPosting } from "../job-posting";
import type { CreateSessionBody } from "../schemas";
import { excerptFor, FULL_TOPICS, QUICK_TOPICS, startInterview, type NewSession, type StartDeps, type StartResume } from "./start";

const DEFAULTS: TopicId[] = ["motivation", "teamwork", "conflict", "pressure", "leadership", "learning_fast"];
const NOT_TAILORED = "I couldn't tailor every question";
const JOB_TEXT = "Acme is hiring a backend intern to build the payment APIs that our merchants rely on every day.";
const body = (patch: Partial<CreateSessionBody> = {}): CreateSessionBody => ({ displayName: "Kazu", mode: "quick", ...patch });
const item = (i: number): ResumeItem => ({ id: `item-${i}`, kind: "role", label: `Role ${i}`, chunkSeqs: [i], relevanceToRole: 1, covered: false });
const posting = (patch: Partial<JobPosting> = {}): JobPosting =>
  ({ provider: "lever", title: "Backend Intern", company: "Acme", companyInferred: false, text: JOB_TEXT, ...patch }) as JobPosting;

function deps(patch: Partial<StartDeps> & { resume?: StartResume | null; insert?: { id: string } | { error: string } } = {}) {
  const saved: NewSession[] = [];
  const profiles: unknown[] = [];
  const all: StartDeps = {
    store: {
      saveProfile: async (p) => profiles.push(p),
      loadResume: async () => patch.resume ?? null,
      insertSession: async (row) => {
        saved.push(row);
        return patch.insert ?? { id: "session-1" };
      },
    },
    fetchPosting: vi.fn(async (): Promise<JobPosting> => {
      throw new Error("no posting expected");
    }),
    // What generateQuestionPlan returns without the model.
    generatePlan: vi.fn<StartDeps["generatePlan"]>(async (inputs) => fallbackPlan(inputs)),
    defaultTopics: vi.fn<StartDeps["defaultTopics"]>((_family, n) => DEFAULTS.slice(0, n)),
    ...patch,
  };
  return { deps: all, saved, profiles };
}

describe("startInterview", () => {
  it("opens a quick interview on the first default topic and saves it", async () => {
    const { deps: d, saved, profiles } = deps();
    const outcome = await startInterview(body(), d);
    expect(outcome.kind).toBe("created");
    if (outcome.kind !== "created") return;
    expect(outcome.sessionId).toBe("session-1");
    expect(outcome.state.topics).toEqual(DEFAULTS.slice(0, QUICK_TOPICS));
    expect(outcome.firstQuestion).toEqual({ text: questionFor("motivation", 1), type: "opening", topic: "motivation", difficulty: 1, source: "bank" });
    expect(outcome.personalized).toBe(false);
    // Nothing to tailor to, so nothing to apologise for.
    // Greeted by name first; the introduction comes after the candidate answers.
    expect(outcome.greetingLine).toBe("Hi Kazu, thanks for making the time today. How are you doing?");
    expect(outcome.introLine).toMatch(/^I'm Jordan, part of the hiring team, and I'll be interviewing you today\./);
    expect(outcome.introLine).not.toContain(NOT_TAILORED);
    // No title given: none is written over the one already saved.
    expect(profiles).toEqual([{ display_name: "Kazu" }]);
    expect(saved[0]).toMatchObject({ role_text: null, job_url: null, resume_id: null, question_count: 1, question_plan: outcome.plan });
  });

  it("draws more topics for a full interview", async () => {
    const { deps: d } = deps();
    const outcome = await startInterview(body({ mode: "full" }), d);
    expect(outcome.kind === "created" && outcome.state.topics).toHaveLength(FULL_TOPICS);
  });

  it("chooses topics and the level from the job title", async () => {
    const { deps: d, profiles } = deps();
    const outcome = await startInterview(body({ targetRole: "Backend Engineering Intern" }), d);
    expect(d.defaultTopics).toHaveBeenCalledWith("software", QUICK_TOPICS);
    // The interviewer does the job, and names the role.
    expect(outcome.kind === "created" && outcome.introLine).toMatch(
      /^I'm Jordan, a software engineer on the team, and I'll be interviewing you for the Backend Engineering Intern role today\./,
    );
    expect(vi.mocked(d.generatePlan).mock.calls[0][0]).toMatchObject({ family: "software", seniority: "intern", targetRole: "Backend Engineering Intern" });
    expect(profiles).toEqual([{ display_name: "Kazu", target_role: "Backend Engineering Intern" }]);
  });

  it("says so when job details were given but the plan couldn't use them", async () => {
    const { deps: d } = deps();
    const outcome = await startInterview(body({ targetRole: "Product Manager" }), d);
    if (outcome.kind !== "created") throw new Error(outcome.kind);
    expect(outcome.personalized).toBe(false);
    expect(outcome.introLine).toContain(NOT_TAILORED);
  });

  it("follows the plan's topic order, resume order and planned opening", async () => {
    const items = [item(0), item(1), item(2)];
    const generatePlan = vi.fn<StartDeps["generatePlan"]>(async (inputs) => ({
      ...fallbackPlan(inputs),
      topics: { motivation: { l1: "What draws you to payments work at Acme?" } },
      order: ["motivation", "technical_knowledge", "teamwork", "conflict"],
      resumeOrder: ["item-2"],
      job: { ...fallbackPlan(inputs).job!, generated: true },
    }));
    const { deps: d } = deps({ generatePlan, resume: { coverage_items: items, resume_facts: null, role_profile: null, resume_chunks: [] } });
    const outcome = await startInterview(body({ targetRole: "Backend Intern", resumeId: "6f1c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f" }), d);
    if (outcome.kind !== "created") throw new Error(outcome.kind);
    expect(outcome.state.topics).toEqual(["motivation", "technical_knowledge", "teamwork", "conflict"]);
    expect(outcome.state.resumeItems.map((i) => i.id)).toEqual(["item-2", "item-0", "item-1"]);
    expect(outcome.firstQuestion.text).toBe("What draws you to payments work at Acme?");
    expect(outcome.personalized).toBe(true);
    expect(outcome.introLine).not.toContain(NOT_TAILORED);
  });

  it("prefers a stated company to one read from the posting link", async () => {
    const fromLink = posting({ company: "Greenhouse Board", companyInferred: true });
    const stated = deps({ fetchPosting: async () => fromLink });
    await startInterview(body({ jobUrl: "https://boards.greenhouse.io/acme/jobs/1", company: "Acme" }), stated.deps);
    expect(vi.mocked(stated.deps.generatePlan).mock.calls[0][0]).toMatchObject({ company: "Acme", companyInferred: false });

    const guessed = deps({ fetchPosting: async () => fromLink });
    const outcome = await startInterview(body({ jobUrl: "https://boards.greenhouse.io/acme/jobs/1" }), guessed.deps);
    expect(vi.mocked(guessed.deps.generatePlan).mock.calls[0][0]).toMatchObject({ company: "Greenhouse Board", companyInferred: true, targetRole: "Backend Intern", jobText: JOB_TEXT });
    expect(outcome.kind === "created" && outcome.posting).toBe(fromLink);
    expect(guessed.saved[0]).toMatchObject({ role_text: JOB_TEXT, job_url: "https://boards.greenhouse.io/acme/jobs/1" });
  });

  it("treats a description too short to be one as none", async () => {
    const { deps: d, saved } = deps();
    await startInterview(body({ roleText: "asdf" }), d);
    expect(vi.mocked(d.generatePlan).mock.calls[0][0].jobText).toBeNull();
    expect(saved[0].role_text).toBeNull();
  });

  // A resume that couldn't be read (an error, or not this user's) must not be
  // stored on the session: turns would later read facts the plan never had.
  it("only points the session at a resume it could read", async () => {
    const { deps: d, saved } = deps({ resume: null });
    const outcome = await startInterview(body({ resumeId: "6f1c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f" }), d);
    expect(outcome.kind).toBe("created");
    expect(saved[0].resume_id).toBeNull();
    const read = deps({ resume: { coverage_items: [item(0)], resume_facts: null, role_profile: null, resume_chunks: [] } });
    await startInterview(body({ resumeId: "6f1c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f" }), read.deps);
    expect(read.saved[0].resume_id).toBe("6f1c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f");
  });

  it("apologises when only the resume's role was there to tailor to, and the plan failed", async () => {
    const role = { title: "Platform Intern", seniority: "intern", requiredSkills: [], responsibilities: [], competencies: [] };
    const { deps: d } = deps({ resume: { coverage_items: [], resume_facts: null, role_profile: role, resume_chunks: [] } });
    const outcome = await startInterview(body({ resumeId: "6f1c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f" }), d);
    if (outcome.kind !== "created") throw new Error(outcome.kind);
    expect(outcome.introLine).toContain(NOT_TAILORED);
  });

  it("counts every resume item, even ones a full interview can't reach", async () => {
    const items = Array.from({ length: FULL_QUESTION_CAP_MAX }, (_, i) => item(i));
    const { deps: d } = deps({ resume: { coverage_items: items, resume_facts: null, role_profile: null, resume_chunks: [] } });
    const outcome = await startInterview(body({ mode: "full", resumeId: "6f1c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f" }), d);
    if (outcome.kind !== "created") throw new Error(outcome.kind);
    expect(outcome.coverageTotal).toBe(items.length);
    expect(outcome.state.resumeItems.length).toBeLessThan(items.length);
  });

  it("plans only the first few resume items in a quick interview", async () => {
    const items = Array.from({ length: 7 }, (_, i) => item(i));
    const { deps: d } = deps({ resume: { coverage_items: items, resume_facts: null, role_profile: null, resume_chunks: [] } });
    await startInterview(body({ resumeId: "6f1c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f" }), d);
    expect(vi.mocked(d.generatePlan).mock.calls[0][0].resumeItems).toHaveLength(4);
  });

  it("reports a posting link it can't read", async () => {
    const error = new JobLinkError("We can't read postings from that site.", "unsupported");
    const { deps: d, saved } = deps({ fetchPosting: async () => Promise.reject(error) });
    expect(await startInterview(body({ jobUrl: "https://example.com/1" }), d)).toEqual({ kind: "bad-link", error });
    expect(saved).toHaveLength(0);
  });

  it("throws any other posting failure", async () => {
    const { deps: d } = deps({ fetchPosting: async () => Promise.reject(new Error("socket hang up")) });
    await expect(startInterview(body({ jobUrl: "https://jobs.lever.co/a/b" }), d)).rejects.toThrow("socket hang up");
  });

  it("reports a session that couldn't be saved", async () => {
    const { deps: d } = deps({ insert: { error: "rls denied" } });
    expect(await startInterview(body(), d)).toEqual({ kind: "failed", reason: "rls denied" });
  });
});

describe("excerptFor", () => {
  it("joins an item's chunks in order, whitespace folded, or falls back to its label", () => {
    const chunks = [
      { seq: 2, content: "Second\n  part." },
      { seq: 1, content: "First part." },
      { seq: 9, content: "Not this one." },
    ];
    expect(excerptFor({ ...item(0), chunkSeqs: [2, 1] }, chunks)).toBe("First part. Second part.");
    expect(excerptFor({ ...item(0), chunkSeqs: [5] }, chunks)).toBe("Role 0");
  });
});
