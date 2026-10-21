import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSession, deleteSession, generateReport, submitTurn, uploadResume } from "./api";

const server = vi.fn<typeof fetch>();
const reply = (status: number, body?: unknown) =>
  server.mockResolvedValueOnce(body === undefined ? new Response(null, { status }) : Response.json(body, { status }));
const ANSWER = { transcript: "I led it.", clientTurnSeq: 2, holdMs: 4000, captureMs: 3500 };

beforeEach(() => {
  server.mockReset();
  vi.stubGlobal("fetch", server);
});
afterEach(() => vi.unstubAllGlobals());

describe("submitTurn", () => {
  it("posts the answer as JSON to the session's turns", async () => {
    reply(200, { kind: "nudge", line: "Go on." });
    await submitTurn("s1", ANSWER);
    const [url, init] = server.mock.calls[0];
    expect(url).toBe("/api/sessions/s1/turns");
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(String(init?.body))).toEqual(ANSWER);
  });

  it("hands back an answered turn, and a nudge as just its line", async () => {
    const turn = { kind: "turn", move: "deepen", notepad: {}, next: null, done: false, progress: {} };
    reply(200, turn);
    expect(await submitTurn("s1", ANSWER)).toEqual({ kind: "turn", turn });
    reply(200, { kind: "nudge", line: "Take your time." });
    expect(await submitTurn("s1", ANSWER)).toEqual({ kind: "nudge", line: "Take your time." });
  });

  it("tells a stale submit (a 409 with state) from a finished interview (a 409 without)", async () => {
    reply(409, { error: "Stale turn sequence", expected: 3, received: 2, state: {} });
    expect(await submitTurn("s1", ANSWER)).toEqual({ kind: "stale" });
    reply(409, { error: "This interview has already finished." });
    expect(await submitTurn("s1", ANSWER)).toEqual({ kind: "finished" });
    reply(409);
    expect(await submitTurn("s1", ANSWER)).toEqual({ kind: "finished" });
  });

  it("words other failures for the candidate, and spots a request that never arrived", async () => {
    reply(500, { error: "Couldn't save your answer. Please try again." });
    expect(await submitTurn("s1", ANSWER)).toEqual({ kind: "failed", message: "Couldn't save your answer. Please try again." });
    reply(422, { error: "Invalid request", detail: [] });
    expect(await submitTurn("s1", ANSWER)).toEqual({ kind: "failed", message: "Some of those details don't look right. Please check and try again." });
    server.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await submitTurn("s1", ANSWER)).toEqual({ kind: "offline" });
  });
});

describe("the other calls", () => {
  it("creates a session from a JSON body", async () => {
    reply(200, { sessionId: "s1", introLine: "Hi" });
    expect(await createSession({ displayName: "Kazu" })).toEqual({ ok: true, status: 200, data: { sessionId: "s1", introLine: "Hi" } });
    expect(server.mock.calls[0][0]).toBe("/api/sessions");
    expect(JSON.parse(String(server.mock.calls[0][1]?.body))).toEqual({ displayName: "Kazu" });
  });

  it("uploads a resume as the form it was given", async () => {
    const form = new FormData();
    form.append("roleText", "x");
    reply(413, { error: "Resume must be under 4MB." });
    expect(await uploadResume(form)).toEqual({
      ok: false,
      offline: false,
      status: 413,
      message: "Resume must be under 4MB.",
      body: { error: "Resume must be under 4MB." },
    });
    expect(server.mock.calls[0][1]).toEqual({ method: "POST", body: form });
  });

  it("reads a report, and gives the status of a refusal", async () => {
    reply(200, { summary: "Done." });
    expect(await generateReport("s1")).toMatchObject({ ok: true, data: { summary: "Done." } });
    reply(409, { error: "Answer at least one question before ending the interview." });
    expect(await generateReport("s1")).toMatchObject({ ok: false, offline: false, status: 409 });
    expect(server.mock.calls[0]).toEqual(["/api/sessions/s1/report", { method: "POST" }]);
  });

  it("deletes with no body to read, and reports a missing one as a 404", async () => {
    reply(204);
    expect(await deleteSession("s1")).toEqual({ ok: true, status: 204, data: null });
    reply(404, { error: "Not found" });
    expect(await deleteSession("s1")).toMatchObject({ ok: false, offline: false, status: 404 });
    server.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await deleteSession("s1")).toEqual({ ok: false, offline: true });
  });
});
