import { describe, expect, it, vi } from "vitest";

import { questionFor } from "../engine/bank";
import { FULL_QUESTION_CAP_MAX, type ResumeItem, type TopicId } from "../engine/types";
import { JobLinkError, type JobPosting } from "../job-posting";
import type { CreateSessionBody, QuestionPlan } from "../schemas";
import { excerptFor, FULL_TOPICS, QUICK_TOPICS, startInterview, type NewSession, type StartDeps, type StartResume } from "./start";

const ALL_TOPICS: TopicId[] = ["teamwork", "conflict", "pressure", "leadership", "learning_fast", "persuasion"];
const body = (patch: Partial<CreateSessionBody> = {}): CreateSessionBody => ({ displayName: "Kazu", mode: "quick", ...patch });
const item = (i: number): ResumeItem => ({ id: `item-${i}`, kind: "role", label: `Role ${i}`, chunkSeqs: [i], relevanceToRole: 1, covered: false });

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
    generatePlan: vi.fn(async () => null),
    pickTopics: (n) => ALL_TOPICS.slice(0, n),
    ...patch,
  };
  return { deps: all, saved, profiles };
}

describe("startInterview", () => {
  it("opens a quick interview on the bank's first question and saves it", async () => {
    const { deps: d, saved, profiles } = deps();
    const outcome = await startInterview(body({ targetRole: "Backend Intern" }), d);
    expect(outcome.kind).toBe("created");
    if (outcome.kind !== "created") return;
    expect(outcome.sessionId).toBe("session-1");
    expect(outcome.state.topics).toHaveLength(QUICK_TOPICS);
    expect(outcome.firstQuestion).toEqual({ text: questionFor("teamwork", 1), type: "opening", topic: "teamwork", difficulty: 1, source: "bank" });
    expect(outcome.plan).toBeNull();
    expect(profiles).toEqual([{ display_name: "Kazu", target_role: "Backend Intern" }]);
    expect(saved[0]).toMatchObject({ role_text: null, job_url: null, resume_id: null, question_count: 1 });
  });

  it("draws more topics for a full interview", async () => {
    const { deps: d } = deps();
    const outcome = await startInterview(body({ mode: "full" }), d);
    expect(outcome.kind === "created" && outcome.state.topics).toHaveLength(FULL_TOPICS);
  });

  it("asks the planned opening when the plan has one", async () => {
    const plan: QuestionPlan = { version: 1, role: null, topics: { teamwork: { l1: "Planned opening?" } }, resume: {} };
    const { deps: d } = deps({ generatePlan: async () => plan });
    const outcome = await startInterview(body(), d);
    expect(outcome.kind === "created" && outcome.firstQuestion.text).toBe("Planned opening?");
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
    const generatePlan = vi.fn<StartDeps["generatePlan"]>(async () => null);
    const items = Array.from({ length: 7 }, (_, i) => item(i));
    const { deps: d } = deps({ generatePlan, resume: { coverage_items: items, resume_facts: null, role_profile: null, resume_chunks: [] } });
    await startInterview(body({ resumeId: "6f1c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f" }), d);
    expect(generatePlan.mock.calls[0][0].resumeItems).toHaveLength(4);
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
