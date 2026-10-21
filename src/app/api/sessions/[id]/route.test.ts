/** The HTTP contract of DELETE /api/sessions/[id]: statuses and bodies, branch by branch. */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, filterValue, type FakeResult } from "@/lib/testing/fake-supabase";

vi.mock("@/lib/auth", () => ({ getUserOrNull: vi.fn(), UNAUTHORIZED: { error: "Unauthorized" } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { getUserOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { DELETE } from "./route";

const ID = "8d1c5c0e-6b7a-4f1e-9d2c-3b4a5f6e7d8c";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as Parameters<typeof DELETE>[1];
const request = () => new Request(`http://localhost/api/sessions/${ID}`, { method: "DELETE" });

function database(result: FakeResult) {
  const fake = fakeSupabase(() => result);
  vi.mocked(createClient).mockResolvedValue(fake.client as never);
  return fake;
}

beforeEach(() => {
  vi.mocked(getUserOrNull).mockResolvedValue({ id: "user-1" });
});

describe("DELETE /api/sessions/[id]", () => {
  it("answers 401 when signed out", async () => {
    vi.mocked(getUserOrNull).mockResolvedValue(null);
    const res = await DELETE(request(), ctx(ID));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("answers 404 for a malformed id, without touching the database", async () => {
    const fake = database({});
    const res = await DELETE(request(), ctx("not-a-uuid"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    expect(fake.queries).toHaveLength(0);
  });

  it("answers 500 with a plain message when the delete fails, logging the detail", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    database({ error: { message: "connection reset" } });
    const res = await DELETE(request(), ctx(ID));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't delete that interview. Please try again." });
    expect(log.mock.calls[0][0]).toContain("connection reset");
    log.mockRestore();
  });

  it("answers 404 when nothing was deleted (missing, or another user's)", async () => {
    database({ data: [] });
    const res = await DELETE(request(), ctx(ID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("answers 204 with no body once the session is gone", async () => {
    const fake = database({ data: [{ id: ID }] });
    const res = await DELETE(request(), ctx(ID));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(fake.queries[0]).toMatchObject({ table: "interview_sessions", action: "delete", columns: "id" });
    expect(filterValue(fake.queries[0], "id")).toBe(ID);
  });
});
