/**
 * The HTTP contract of POST /api/sessions/[id]/turns: every branch's status
 * and body, the context handed to runTurn, and what is written. The turn
 * itself is scripted; lib/interview/turn.test.ts covers its logic.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { initState } from "@/lib/engine/policy";
import type { EngineState, Question } from "@/lib/engine/types";
import type { TurnResult } from "@/lib/interview/turn";
import { fakeSupabase, type FakeQuery, type FakeResult } from "@/lib/testing/fake-supabase";

vi.mock("@/lib/auth", () => ({ getUserOrNull: vi.fn(), UNAUTHORIZED: { error: "Unauthorized" } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void task(),
}));
vi.mock("@/lib/interview/turn", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/interview/turn")>()),
  runTurn: vi.fn(),
}));

import { getUserOrNull } from "@/lib/auth";
import { runTurn } from "@/lib/interview/turn";
import { createClient } from "@/lib/supabase/server";

import { POST } from "./route";

const ID = "8d1c5c0e-6b7a-4f1e-9d2c-3b4a5f6e7d8c";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as Parameters<typeof POST>[1];
const request = (body: unknown) =>
  new Request(`http://localhost/api/sessions/${ID}/turns`, { method: "POST", body: JSON.stringify(body) });

const FIRST: Question = { text: "Tell me about a time you led a team.", type: "opening", topic: "teamwork", difficulty: 1, source: "bank" };
const NEXT: Question = { text: "What did you do first?", type: "deepen", topic: "teamwork", difficulty: 1, source: "bank" };
const STATE: EngineState = initState({ mode: "quick", topics: ["teamwork", "conflict", "pressure", "leadership"], resumeItems: [], firstQuestion: FIRST });
const ADVANCED: EngineState = { ...STATE, turnSeq: 1, questionCount: 2, currentQuestion: NEXT, askedQuestions: [FIRST.text, NEXT.text] };
const BODY = { transcript: "I led the migration and cut merge times by two thirds.", holdMs: 9000, captureMs: 8000, clientTurnSeq: 1 };

const NOTE = {
  seq: 1,
  topic: "teamwork",
  questionType: "opening",
  source: "bank",
  kind: "behavioral" as const,
  scores: null,
  band: null,
  primaryGap: null,
  evidence: null,
  observation: "Clear situation.",
  reason: "Asked what you did first.",
  degraded: true,
};
const TURN: TurnResult = {
  kind: "turn",
  state: ADVANCED,
  move: "deepen",
  notepad: NOTE,
  next: NEXT,
  done: false,
  stats: { wpm: 140, fillers: 1 },
  persistedScores: null,
  degradedReason: "unavailable",
  evalMs: 12,
};

const SESSION_ROW = { id: ID, engine_state: STATE, resume_id: null, status: "in_progress", role_text: null, question_plan: null };

interface Script {
  session?: unknown;
  sessionError?: string;
  history?: unknown[];
  historyError?: string;
  resume?: unknown;
  latest?: unknown;
  submit?: FakeResult;
}

function database(script: Script) {
  const answer = (q: FakeQuery): FakeResult => {
    if (q.table === "interview_sessions") {
      // The race path re-reads only the engine state.
      if (q.columns === "engine_state") return { data: script.latest ?? null };
      return script.sessionError ? { error: { message: script.sessionError } } : { data: script.session ?? null };
    }
    if (q.table === "turns") return script.historyError ? { error: { message: script.historyError } } : { data: script.history ?? [] };
    if (q.table === "resumes") return { data: script.resume ?? null };
    return {};
  };
  const fake = fakeSupabase(answer, () => script.submit ?? {});
  vi.mocked(createClient).mockResolvedValue(fake.client as never);
  return fake;
}

beforeEach(() => {
  vi.mocked(getUserOrNull).mockResolvedValue({ id: "user-1" });
  vi.mocked(runTurn).mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("POST /api/sessions/[id]/turns", () => {
  it("answers 401 when signed out", async () => {
    vi.mocked(getUserOrNull).mockResolvedValue(null);
    const res = await POST(request(BODY), ctx(ID));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("answers 422 for an invalid body, before looking at the id", async () => {
    const res = await POST(request({ transcript: "" }), ctx("nope"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
    expect(Array.isArray(body.detail)).toBe(true);
  });

  it("answers 404 for a malformed id", async () => {
    const res = await POST(request(BODY), ctx("nope"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("answers 500 when the session can't be read (not a 404)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    database({ sessionError: "column missing" });
    const res = await POST(request(BODY), ctx(ID));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't load the interview. Please try again." });
    expect(log.mock.calls[0][0]).toContain("column missing");
  });

  it("answers 404 for a session it cannot see", async () => {
    database({ session: null });
    const res = await POST(request(BODY), ctx(ID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("answers 409 once the interview has finished", async () => {
    database({ session: { ...SESSION_ROW, status: "completed" } });
    const res = await POST(request(BODY), ctx(ID));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "This interview has already finished." });
  });

  it("answers 409 with the state to resync from for a stale sequence", async () => {
    database({ session: SESSION_ROW });
    const res = await POST(request({ ...BODY, clientTurnSeq: 5 }), ctx(ID));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Stale turn sequence", expected: 1, received: 5, state: STATE });
    expect(runTurn).not.toHaveBeenCalled();
  });

  it("hands runTurn the answer, the plan's role, the resume facts and the thread so far", async () => {
    const plan = {
      version: 1,
      role: { title: "Backend Intern", seniority: "intern", requiredSkills: ["Go"], responsibilities: [], competencies: [] },
      topics: {},
      resume: {},
    };
    database({
      session: { ...SESSION_ROW, resume_id: "r1", role_text: "A raw posting", question_plan: plan },
      resume: { resume_facts: { skills: ["Go"] }, role_profile: { title: "From the resume" } },
      history: [{ seq: 0, question_text: "Earlier?", answer_transcript: "Earlier answer." }],
    });
    vi.mocked(runTurn).mockResolvedValue({ kind: "nudge", line: "Take your time.", state: STATE });
    await POST(request(BODY), ctx(ID));
    const turnCtx = vi.mocked(runTurn).mock.calls[0][0];
    expect(turnCtx).toMatchObject({ state: STATE, transcript: BODY.transcript, holdMs: 9000, captureMs: 8000 });
    expect(turnCtx.roleText).toContain("Backend Intern");
    expect(turnCtx.resumeFacts).toContain("Go");
    expect(turnCtx.role).toEqual({ title: "From the resume" });
    expect(turnCtx.plan).toEqual(plan);
    expect(turnCtx.priorThreadTurns).toEqual([]);
  });

  it("falls back to the session's posting text and no plan when the plan is malformed", async () => {
    database({ session: { ...SESSION_ROW, role_text: "A raw posting", question_plan: { version: 99 } } });
    vi.mocked(runTurn).mockResolvedValue({ kind: "nudge", line: "Go on.", state: STATE });
    await POST(request(BODY), ctx(ID));
    const turnCtx = vi.mocked(runTurn).mock.calls[0][0];
    expect(turnCtx.roleText).toBe("A raw posting");
    expect(turnCtx.plan).toBeNull();
    expect(turnCtx.resumeFacts).toBeNull();
  });

  it("still runs the turn when the history can't be read", async () => {
    database({ session: SESSION_ROW, historyError: "timeout" });
    vi.mocked(runTurn).mockResolvedValue({ kind: "nudge", line: "Go on.", state: STATE });
    const res = await POST(request(BODY), ctx(ID));
    expect(res.status).toBe(200);
  });

  it("answers a nudge without writing anything", async () => {
    const fake = database({ session: SESSION_ROW });
    vi.mocked(runTurn).mockResolvedValue({ kind: "nudge", line: "Take your time.", state: STATE });
    const res = await POST(request(BODY), ctx(ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: "nudge", line: "Take your time." });
    expect(fake.calls).toHaveLength(0);
  });

  it("saves the turn atomically and answers with the next question and progress", async () => {
    const fake = database({ session: SESSION_ROW });
    vi.mocked(runTurn).mockResolvedValue(TURN);
    const res = await POST(request(BODY), ctx(ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      kind: "turn",
      move: "deepen",
      notepad: NOTE,
      next: NEXT,
      done: false,
      progress: { questionCount: 2, questionCap: STATE.questionCap, topicIndex: 0, topicsTotal: 4, coverageDone: 0, coverageTotal: 0 },
    });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].name).toBe("submit_turn");
    expect(fake.calls[0].args).toMatchObject({
      p_session_id: ID,
      p_seq: 1,
      p_engine_state: ADVANCED,
      p_turn: { question_text: FIRST.text, answer_transcript: BODY.transcript, hold_ms: 9000, capture_ms: 8000, wpm: 140, degraded_reason: "unavailable" },
    });
  });

  it("speaks a new thread's lead before its question, and passes the wrap line", async () => {
    database({ session: SESSION_ROW });
    vi.mocked(runTurn).mockResolvedValue({ ...TURN, lead: "Let's switch topics.", wrapLine: undefined, done: false });
    const res = await POST(request(BODY), ctx(ID));
    expect((await res.json()).next).toEqual({ ...NEXT, lead: "Let's switch topics." });
  });

  it("answers 409 with the winner's state when another submit got there first", async () => {
    const winner = { ...ADVANCED, questionCount: 3 };
    database({ session: SESSION_ROW, submit: { error: { message: "stale turn", code: "PT409" } }, latest: { engine_state: winner } });
    vi.mocked(runTurn).mockResolvedValue(TURN);
    const res = await POST(request(BODY), ctx(ID));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Stale turn sequence", expected: 2, received: 1, state: winner });
  });

  it("answers 500 with a plain message when the save fails, logging the detail", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    database({ session: SESSION_ROW, submit: { error: { message: "disk full", code: "53100" } } });
    vi.mocked(runTurn).mockResolvedValue(TURN);
    const res = await POST(request(BODY), ctx(ID));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't save your answer. Please try again." });
    expect(log.mock.calls[0][0]).toContain("disk full");
  });
});
