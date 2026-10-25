/**
 * The HTTP contract of POST /api/sessions: every branch's status and body,
 * what the question plan is asked to write, and what is stored. The model
 * call and the posting fetch are scripted; without the model the plan is the
 * real fallback, as in production.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QuestionPlan } from "@/lib/schemas";
import { fakeSupabase, type FakeQuery, type FakeResult } from "@/lib/testing/fake-supabase";

vi.mock("@/lib/auth", () => ({ getUserOrNull: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai/question-plan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/question-plan")>()),
  generateQuestionPlan: vi.fn(),
}));
vi.mock("@/lib/job-posting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/job-posting")>()),
  fetchJobPosting: vi.fn(),
}));

import { fallbackPlan, generateQuestionPlan } from "@/lib/ai/question-plan";
import { getUserOrNull } from "@/lib/auth";
import { questionFor } from "@/lib/engine/bank";
import { fetchJobPosting, JobLinkError } from "@/lib/job-posting";
import { createClient } from "@/lib/supabase/server";

import { POST } from "./route";

const RESUME_ID = "6f1c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f";
// Both long enough to count as a job description (MIN_JOB_TEXT_CHARS).
const DESCRIPTION = "We build developer tools that help teams ship backend services safely, from local builds to production.";
const POSTING = "Acme is hiring a backend intern to build the payment APIs that our merchants rely on every day.";
const request = (body: unknown) =>
  new Request("http://localhost/api/sessions", { method: "POST", body: JSON.stringify(body) });

const ITEMS = Array.from({ length: 6 }, (_, i) => ({
  id: `item-${i}`,
  kind: "role" as const,
  label: `Role ${i}`,
  chunkSeqs: [i],
  relevanceToRole: 1 - i / 10,
  covered: false,
}));
const RESUME_ROW = {
  coverage_items: ITEMS,
  resume_facts: { skills: ["Go", "SQL"] },
  role_profile: { title: "Platform Intern", seniority: "intern", requiredSkills: ["Go"], responsibilities: [], competencies: [] },
  resume_chunks: [
    { seq: 1, content: "Second   chunk." },
    { seq: 0, content: "First chunk,\nwith a line break." },
  ],
};

function database(script: { resume?: unknown; insert?: FakeResult } = {}) {
  const answer = (q: FakeQuery): FakeResult => {
    if (q.table === "resumes") return { data: script.resume ?? null };
    if (q.table === "interview_sessions") return script.insert ?? { data: { id: "new-session" } };
    return {};
  };
  const fake = fakeSupabase(answer);
  vi.mocked(createClient).mockResolvedValue(fake.client as never);
  return fake;
}

beforeEach(() => {
  vi.mocked(getUserOrNull).mockResolvedValue({ id: "user-1" });
  vi.mocked(generateQuestionPlan).mockReset().mockImplementation(async (inputs) => fallbackPlan(inputs));
  vi.mocked(fetchJobPosting).mockReset();
});

describe("POST /api/sessions", () => {
  it("answers 401 when signed out", async () => {
    vi.mocked(getUserOrNull).mockResolvedValue(null);
    const res = await POST(request({ displayName: "Kazu" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("answers 422 for an invalid body", async () => {
    const res = await POST(request({ displayName: "" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
    expect(Array.isArray(body.detail)).toBe(true);
  });

  it("answers 422 with the reason for a posting link it can't read", async () => {
    database();
    vi.mocked(fetchJobPosting).mockRejectedValue(new JobLinkError("We can't read postings from that site.", "unsupported"));
    const res = await POST(request({ displayName: "Kazu", jobUrl: "https://example.com/job/1" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "We can't read postings from that site.", code: "unsupported" });
  });

  it("lets any other posting failure escape as a server error", async () => {
    database();
    vi.mocked(fetchJobPosting).mockRejectedValue(new Error("socket hang up"));
    await expect(POST(request({ displayName: "Kazu", jobUrl: "https://jobs.lever.co/acme/abc" }))).rejects.toThrow("socket hang up");
  });

  it("answers 500 with a plain message when the session can't be saved, logging the detail", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    database({ insert: { error: { message: "rls denied" } } });
    const res = await POST(request({ displayName: "Kazu" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't start the interview. Please try again." });
    expect(log.mock.calls[0][0]).toContain("rls denied");
    log.mockRestore();
  });

  it("starts a quick interview on the role defaults: motivation first, the opening line", async () => {
    const fake = database();
    const res = await POST(request({ displayName: "Kazu" }));
    expect(res.status).toBe(200);
    const first = { text: questionFor("motivation", 1), type: "opening", topic: "motivation", difficulty: 1, source: "bank" };
    expect(await res.json()).toEqual({
      sessionId: "new-session",
      mode: "quick",
      greetingLine: "Hi Kazu, thanks for making the time today. How are you doing?",
      introLine:
        "I'm Jordan, part of the hiring team, and I'll be interviewing you today. When I ask about your experience, examples from school, work, clubs or personal projects all count. Let's get started.",
      question: first,
      personalized: false,
      job: null,
      progress: { questionCount: 1, questionCap: 10, coverageTotal: 0, coverageDone: 0 },
    });
    // No title given: the saved one is left alone.
    const profile = fake.queries.find((q) => q.table === "profiles");
    expect(profile).toMatchObject({ action: "update", payload: { display_name: "Kazu" } });
    expect(profile?.payload).not.toHaveProperty("target_role");
    const insert = fake.queries.find((q) => q.table === "interview_sessions");
    expect(insert?.payload).toMatchObject({ role_text: null, job_url: null, resume_id: null, question_count: 1 });
    const stored = insert?.payload as { question_plan: QuestionPlan; engine_state: { topics: string[] } };
    expect(stored.engine_state.topics).toHaveLength(4);
    expect(stored.question_plan.job).toMatchObject({ family: "general", generated: false });
  });

  it("says when the job details given couldn't be used, and saves the title", async () => {
    const fake = database();
    const res = await POST(request({ displayName: "Kazu", targetRole: "Backend Engineering Intern" }));
    const body = await res.json();
    expect(body.personalized).toBe(false);
    expect(body.introLine).toContain("I couldn't tailor every question to the job details you gave this time");
    // The software family asks its own question second.
    const insert = fake.queries.find((q) => q.table === "interview_sessions");
    expect((insert?.payload as { engine_state: { topics: string[] } }).engine_state.topics.slice(0, 2)).toEqual(["motivation", "technical_knowledge"]);
    expect(fake.queries.find((q) => q.table === "profiles")?.payload).toEqual({ display_name: "Kazu", target_role: "Backend Engineering Intern" });
  });

  it("plans a full interview from the resume: every item, quoted from its chunks", async () => {
    database({ resume: RESUME_ROW });
    await POST(request({ displayName: "Kazu", mode: "full", resumeId: RESUME_ID, roleText: DESCRIPTION }));
    const inputs = vi.mocked(generateQuestionPlan).mock.calls[0][0];
    expect(inputs.topics).toHaveLength(6);
    expect(inputs.resumeItems).toHaveLength(6);
    expect(inputs.resumeItems[0]).toEqual({ item: ITEMS[0], excerpt: "First chunk, with a line break." });
    expect(inputs.jobText).toBe(DESCRIPTION);
    expect(inputs.targetRole).toBeNull();
    expect(inputs.family).toBe("software");
    expect(inputs.roleSummary).toContain("Platform Intern");
    expect(inputs.resumeFacts).toContain("Go");
  });

  it("starts without a resume it can't read, and logs why", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = fakeSupabase((q) => (q.table === "resumes" ? { error: { message: "timeout" } } : q.table === "interview_sessions" ? { data: { id: "new-session" } } : {}));
    vi.mocked(createClient).mockResolvedValue(fake.client as never);
    const res = await POST(request({ displayName: "Kazu", resumeId: RESUME_ID }));
    expect(res.status).toBe(200);
    expect(fake.queries.find((q) => q.table === "interview_sessions")?.payload).toMatchObject({ resume_id: null });
    expect(warn.mock.calls[0][0]).toContain("timeout");
    warn.mockRestore();
  });

  it("plans only the first few resume items in a quick interview", async () => {
    database({ resume: RESUME_ROW });
    await POST(request({ displayName: "Kazu", resumeId: RESUME_ID }));
    expect(vi.mocked(generateQuestionPlan).mock.calls[0][0].resumeItems).toHaveLength(4);
  });

  it("uses the posting it read, and says so, and follows the tailored plan", async () => {
    const fake = database();
    vi.mocked(fetchJobPosting).mockResolvedValue({
      provider: "lever",
      title: "Backend Intern",
      company: "Acme",
      companyInferred: false,
      text: POSTING,
    } as never);
    const plan: QuestionPlan = {
      version: 1,
      role: null,
      topics: { motivation: { l1: "What draws you to backend work at a startup like Acme?" } },
      resume: {},
      order: ["motivation", "technical_knowledge", "teamwork", "conflict"],
      resumeOrder: [],
      job: { title: "Backend Intern", company: "Acme", companyInferred: false, family: "software", seniority: "intern", generated: true },
    };
    vi.mocked(generateQuestionPlan).mockResolvedValue(plan);
    const res = await POST(request({ displayName: "Kazu", jobUrl: "https://jobs.lever.co/acme/abc" }));
    const body = await res.json();
    expect(body.personalized).toBe(true);
    expect(body.introLine).not.toContain("couldn't tailor");
    expect(body.job).toEqual({ title: "Backend Intern", company: "Acme", companyInferred: false, provider: "lever" });
    expect(body.question.text).toBe("What draws you to backend work at a startup like Acme?");
    const inputs = vi.mocked(generateQuestionPlan).mock.calls[0][0];
    expect(inputs).toMatchObject({ targetRole: "Backend Intern", company: "Acme", companyInferred: false, jobText: POSTING, family: "software", seniority: "intern" });
    const insert = fake.queries.find((q) => q.table === "interview_sessions");
    expect(insert?.payload).toMatchObject({ role_text: POSTING, job_url: "https://jobs.lever.co/acme/abc", question_plan: plan });
    expect((insert?.payload as { engine_state: { topics: string[] } }).engine_state.topics).toEqual(plan.order);
  });
});
