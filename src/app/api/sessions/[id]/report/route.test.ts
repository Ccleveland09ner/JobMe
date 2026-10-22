/**
 * The HTTP contract of POST /api/sessions/[id]/report, through the real
 * pipeline (lib/interview/report.ts) over a scripted database.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeQuery, type FakeResult } from "@/lib/testing/fake-supabase";

vi.mock("@/lib/auth", () => ({ getUserOrNull: vi.fn(), UNAUTHORIZED: { error: "Unauthorized" } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai/report", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/report")>()),
  generateReportText: vi.fn(async () => ({ summary: "A fair first go.", rewrite: "Situation: …", feedback: FEEDBACK })),
}));

import { generateReportText } from "@/lib/ai/report";
import { getUserOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { POST } from "./route";

const FEEDBACK = vi.hoisted(() => ({
  strengths: [{ question: "Q1", point: "Named the metric.", quote: "p99 fell from 1,200 ms to 340 ms" }],
  improvements: [{ question: "Q1", point: "Say what you owned.", recommendation: "Start with your part." }],
}));

const ID = "8d1c5c0e-6b7a-4f1e-9d2c-3b4a5f6e7d8c";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as Parameters<typeof POST>[1];
const request = () => new Request(`http://localhost/api/sessions/${ID}/report`, { method: "POST" });

const STATS = { wpm: 120, fillers: 2, fillersApproximate: true, answered: 1, scored: 1 };
const REPORT_ROW = { summary: "Clear stories.", weakest_turn_id: "t1", rewrite_text: "Situation: …", stats: STATS };
const TURN_ROW = {
  id: "t1",
  seq: 1,
  question_text: "Tell me about a time…",
  answer_transcript: "I led the fix and p99 fell from 1,200 ms to 340 ms.",
  scores: { situation: 3, task: 3, action: 4, result: 3, specificity: 3, impact: 3, ownership: 4, relevance: 3 },
  primary_gap: "impact",
  capture_ms: 30_000,
};

function database(rows: { session?: unknown; report?: unknown; turns?: unknown[]; fail?: string }) {
  const answer = (q: FakeQuery): FakeResult => {
    if (rows.fail && q.table === rows.fail) return { error: { message: "boom" } };
    if (q.table === "interview_sessions" && q.action === "select") return { data: rows.session ?? null };
    if (q.table === "reports" && q.action === "select") return { data: rows.report ?? null };
    if (q.table === "turns") return { data: rows.turns ?? [] };
    return {};
  };
  const fake = fakeSupabase(answer);
  vi.mocked(createClient).mockResolvedValue(fake.client as never);
  return fake;
}

beforeEach(() => {
  vi.mocked(getUserOrNull).mockResolvedValue({ id: "user-1" });
});

describe("POST /api/sessions/[id]/report", () => {
  it("answers 401 when signed out", async () => {
    vi.mocked(getUserOrNull).mockResolvedValue(null);
    const res = await POST(request(), ctx(ID));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("answers 404 for a malformed id", async () => {
    const res = await POST(request(), ctx("nope"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("answers 404 for a session it cannot see", async () => {
    database({ session: null });
    const res = await POST(request(), ctx(ID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("serves a stored report, healing a session left in progress", async () => {
    const fake = database({
      session: { status: "in_progress", overall_scores: null, ended_at: null },
      report: REPORT_ROW,
      turns: [TURN_ROW],
    });
    const res = await POST(request(), ctx(ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ summary: "Clear stories.", weakestTurnId: "t1", rewrite: "Situation: …", stats: STATS });
    expect(body.overallScores).toMatchObject({ action: 4, ownership: 4 });
    const update = fake.queries.find((q) => q.table === "interview_sessions" && q.action === "update");
    expect(update?.payload).toMatchObject({ status: "completed" });
  });

  it("writes the report once, then completes the session", async () => {
    const fake = database({ session: { status: "in_progress", overall_scores: null, ended_at: null }, turns: [TURN_ROW] });
    const res = await POST(request(), ctx(ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ summary: "A fair first go.", weakestTurnId: "t1" });
    const insert = fake.queries.find((q) => q.table === "reports" && q.action === "insert");
    expect(insert?.payload).toMatchObject({ session_id: ID, summary: "A fair first go.", weakest_turn_id: "t1" });
  });

  it("judges the answers against the job the turns saw, and keeps the feedback", async () => {
    const role = { title: "Backend Intern", seniority: "intern", requiredSkills: ["Go"], responsibilities: [], competencies: [] };
    const job = { title: "Backend Intern", company: "Acme", companyInferred: true, family: "software", seniority: "intern", generated: true };
    const plan = { version: 1, role, topics: {}, resume: {}, job };
    const fake = database({
      session: { status: "in_progress", overall_scores: null, ended_at: null, role_text: "Raw posting", question_plan: plan },
      turns: [{ ...TURN_ROW, topic: "teamwork", question_type: "opening", question_source: "bank" }],
    });
    await POST(request(), ctx(ID));
    expect(vi.mocked(generateReportText).mock.calls.at(-1)?.[0].roleText).toBe(
      "Target role: Backend Intern (intern)\nWants: Go\nCompany: Acme (read from the posting link)",
    );
    const insert = fake.queries.find((q) => q.table === "reports" && q.action === "insert");
    expect((insert?.payload as { stats: { feedback: unknown } }).stats.feedback).toEqual(FEEDBACK);

    // Without a readable plan, the stored posting text stands in.
    database({ session: { status: "in_progress", overall_scores: null, ended_at: null, role_text: "Raw posting", question_plan: null }, turns: [TURN_ROW] });
    await POST(request(), ctx(ID));
    expect(vi.mocked(generateReportText).mock.calls.at(-1)?.[0].roleText).toBe("Raw posting");
  });

  it("answers 409 when nothing has been answered", async () => {
    database({ session: { status: "in_progress", overall_scores: null, ended_at: null }, turns: [] });
    const res = await POST(request(), ctx(ID));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Answer at least one question before ending the interview." });
  });

  it("answers 500 with a plain message when the database fails, logging the detail", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    database({ fail: "turns" });
    const res = await POST(request(), ctx(ID));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't build your scorecard. Please try again." });
    expect(log.mock.calls[0][0]).toContain(ID);
    log.mockRestore();
  });
});
