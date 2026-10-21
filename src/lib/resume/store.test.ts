/** Storing a resume: the row, then its chunks, and the hand-made rollback when the chunks fail. */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, filterValue, type FakeQuery, type FakeResult } from "@/lib/testing/fake-supabase";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";

import type { Chunk } from "./chunk";
import type { ParsedResume } from "./parse";
import type { RedactionResult } from "./redact";
import { ResumeStoreError, storeResume } from "./store";

const parsed = { text: "", pageCount: 1, method: "local", layoutSuspect: false } as ParsedResume;
const redaction = { text: "Redacted text", candidateName: null, removed: {} } as unknown as RedactionResult;
const chunks = [
  { index: 0, section: "experience", content: "First" },
  { index: 1, section: "projects", content: "Second" },
] as Chunk[];
const vectors = [
  [0.1, 0.2],
  [0.3, 0.4],
];

function database(script: { chunks?: FakeResult; rollback?: FakeResult }) {
  const answer = (q: FakeQuery): FakeResult => {
    if (q.table === "resumes" && q.action === "insert") return { data: { id: "resume-1" } };
    if (q.table === "resume_chunks") return script.chunks ?? {};
    if (q.table === "resumes" && q.action === "delete") return script.rollback ?? {};
    return {};
  };
  const fake = fakeSupabase(answer);
  vi.mocked(createClient).mockResolvedValue(fake.client as never);
  return fake;
}

beforeEach(() => vi.mocked(createClient).mockReset());

describe("storeResume", () => {
  it("saves the resume, then every chunk with its vector", async () => {
    const fake = database({});
    expect(await storeResume({ parsed, redaction, chunks, vectors, facts: null })).toEqual({ id: "resume-1", chunkCount: 2, layoutSuspect: false });
    const rows = fake.queries.find((q) => q.table === "resume_chunks")?.payload as { resume_id: string; seq: number; embedding: unknown }[];
    expect(rows.map((r) => [r.resume_id, r.seq, r.embedding])).toEqual([
      ["resume-1", 0, vectors[0]],
      ["resume-1", 1, vectors[1]],
    ]);
  });

  it("removes the resume again when its chunks can't be saved", async () => {
    const fake = database({ chunks: { error: { message: "vector dimension mismatch" } } });
    const error = await storeResume({ parsed, redaction, chunks, vectors, facts: null }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ResumeStoreError);
    expect((error as Error).message).toBe("Could not save resume chunks: vector dimension mismatch");
    const rollback = fake.queries.find((q) => q.table === "resumes" && q.action === "delete");
    expect(rollback && filterValue(rollback, "id")).toBe("resume-1");
  });

  it("says so when the rollback fails too, so the orphan can be found", async () => {
    database({ chunks: { error: { message: "timeout" } }, rollback: { error: { message: "connection lost" } } });
    await expect(storeResume({ parsed, redaction, chunks, vectors, facts: null })).rejects.toThrow(
      "Could not save resume chunks: timeout; resume resume-1 was left behind: connection lost",
    );
  });

  it("refuses chunks and vectors that don't pair up, before writing anything", async () => {
    const fake = database({});
    await expect(storeResume({ parsed, redaction, chunks, vectors: [vectors[0]], facts: null })).rejects.toThrow(ResumeStoreError);
    expect(fake.queries).toHaveLength(0);
  });
});
