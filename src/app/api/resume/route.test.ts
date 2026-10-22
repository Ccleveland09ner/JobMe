/**
 * The HTTP contract of POST /api/resume: the upload guards, each failure's
 * status and body, and the summary returned once stored. Parsing runs for
 * real on non-PDFs; the model calls and the store are scripted.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getUserOrNull: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ client: "server" })) }));
vi.mock("@/lib/ai/embeddings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/embeddings")>()),
  embedMany: vi.fn(),
}));
vi.mock("@/lib/resume/distill", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/resume/distill")>()),
  distillResume: vi.fn(),
}));
vi.mock("@/lib/jd/distill", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/jd/distill")>()),
  distillJobDescription: vi.fn(),
}));
vi.mock("@/lib/resume/items", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/resume/items")>()),
  rankItemsAgainstRole: vi.fn(async (items: unknown) => items),
}));
vi.mock("@/lib/resume/parse", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/resume/parse")>();
  return { ...actual, parseResumePdf: vi.fn(actual.parseResumePdf) };
});
vi.mock("@/lib/resume/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/resume/store")>()),
  storeResume: vi.fn(),
}));

import { embedMany } from "@/lib/ai/embeddings";
import { getUserOrNull } from "@/lib/auth";
import { distillJobDescription } from "@/lib/jd/distill";
import { distillResume } from "@/lib/resume/distill";
import { parseResumePdf } from "@/lib/resume/parse";
import { ResumeStoreError, storeResume } from "@/lib/resume/store";

import { POST } from "./route";

const RESUME_TEXT = [
  "EXPERIENCE",
  "Software Engineer Intern, Acme (2025)",
  "Cut merge times from forty minutes to twelve by quarantining flaky tests.",
  "Contact: kazu@example.com",
  "",
  "PROJECTS",
  "Build dashboard: a Next.js app that tracks the merge queue for 30 engineers.",
].join("\n");

function upload(file: File | null, extra: Record<string, string> = {}) {
  const form = new FormData();
  if (file) form.append("file", file);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return new Request("http://localhost/api/resume", { method: "POST", body: form });
}
const pdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], "cv.pdf", { type: "application/pdf" });

beforeEach(() => {
  vi.mocked(getUserOrNull).mockResolvedValue({ id: "user-1" });
  vi.mocked(embedMany).mockReset().mockImplementation(async (texts: string[]) => texts.map(() => [0.1, 0.2]));
  vi.mocked(distillResume).mockReset().mockResolvedValue({ roles: [{ title: "Software Engineer Intern", employer: "Acme" }], projects: ["Build dashboard"] });
  vi.mocked(distillJobDescription).mockReset().mockResolvedValue(null);
  vi.mocked(storeResume).mockReset().mockResolvedValue({ id: "resume-1", chunkCount: 2, layoutSuspect: false });
});

describe("POST /api/resume", () => {
  it("answers 401 when signed out", async () => {
    vi.mocked(getUserOrNull).mockResolvedValue(null);
    const res = await POST(upload(pdf()));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("answers 413 when the declared size is over the limit, before reading the body", async () => {
    const res = await POST(new Request("http://localhost/api/resume", { method: "POST", headers: { "content-length": String(5 * 1024 * 1024) }, body: "x" }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Resume must be under 4MB." });
  });

  it("answers 400 when the body isn't a form", async () => {
    const res = await POST(new Request("http://localhost/api/resume", { method: "POST", body: "plain text" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Could not read the upload." });
  });

  it("answers 422 when no file was sent", async () => {
    const res = await POST(upload(null, { roleText: "x" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "No file was uploaded." });
  });

  it("answers 422 with the reason when the file isn't a readable PDF", async () => {
    const res = await POST(upload(new File(["hello"], "cv.pdf", { type: "application/pdf" })));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "That file is not a PDF. Export your resume as a PDF and try again.",
      code: "NOT_A_PDF",
    });
  });

  it("answers 422 when the text has no readable sections", async () => {
    vi.mocked(parseResumePdf).mockResolvedValueOnce({ text: "   ", pageCount: 1, method: "local", layoutSuspect: false } as never);
    const res = await POST(upload(pdf()));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "That resume produced no readable sections." });
  });

  it("answers 503 when the model is unavailable", async () => {
    vi.mocked(parseResumePdf).mockResolvedValueOnce({ text: RESUME_TEXT, pageCount: 1, method: "local", layoutSuspect: false } as never);
    vi.mocked(embedMany).mockRejectedValueOnce(new Error("429 RESOURCE_EXHAUSTED"));
    const res = await POST(upload(pdf()));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Could not process the resume right now. The free AI tier allows 15 requests a minute — wait a moment and try again.",
      detail: "429 RESOURCE_EXHAUSTED",
    });
  });

  it("stores the redacted resume and answers with what the interview will cover", async () => {
    vi.mocked(parseResumePdf).mockResolvedValueOnce({ text: RESUME_TEXT, pageCount: 2, method: "local", layoutSuspect: false } as never);
    vi.mocked(distillJobDescription).mockResolvedValueOnce({ title: "Platform Intern", seniority: "intern", requiredSkills: [], responsibilities: [], competencies: [] });
    const res = await POST(upload(pdf(), { roleText: "We build developer tools." }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ resumeId: "resume-1", chunkCount: 2, pageCount: 2, role: { title: "Platform Intern", seniority: "intern" }, layoutSuspect: false, hasFacts: true });
    expect(body.coverage.length).toBeGreaterThan(0);
    expect(body.coverage[0]).toEqual({ id: expect.any(String), kind: "role", label: expect.any(String), relevance: expect.any(Number) });
    expect(body.extractedPreview).not.toContain("kazu@example.com");
    expect(body.redacted).toMatchObject({ email: 1 });
    expect(vi.mocked(distillJobDescription).mock.calls[0][0]).toBe("We build developer tools.");
    const [client, stored] = vi.mocked(storeResume).mock.calls[0];
    expect(client).toEqual({ client: "server" });
    expect(stored.redaction.text).not.toContain("kazu@example.com");
    expect(stored.vectors).toHaveLength(stored.chunks.length);
  });

  it("answers 500 with a plain message when saving fails, keeping the database's detail in the log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(parseResumePdf).mockResolvedValueOnce({ text: RESUME_TEXT, pageCount: 1, method: "local", layoutSuspect: false } as never);
    vi.mocked(storeResume).mockRejectedValueOnce(new ResumeStoreError("Could not save the resume: rls"));
    const res = await POST(upload(pdf()));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't save your resume. Please try again." });
    expect(log.mock.calls[0][0]).toContain("Could not save the resume: rls");
    log.mockRestore();
  });
});
