import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { loadVisitorFacts, markWelcomed, visitorStatus, WELCOMED_KEY } from "./visitor";

describe("visitorStatus", () => {
  const base = { welcomedAt: null, interviews: 0, seenHere: false, known: true };

  it("is new for an account she has never greeted and that has never interviewed", () => {
    expect(visitorStatus(base)).toBe("new");
  });

  it("is returning once the account has been greeted, on any device", () => {
    expect(visitorStatus({ ...base, welcomedAt: "2026-10-26T09:00:00Z" })).toBe("returning");
  });

  it("is returning for anyone who has interviewed here before, flag or not", () => {
    expect(visitorStatus({ ...base, interviews: 3 })).toBe("returning");
  });

  it("trusts the account over this device: a cleared browser doesn't make a regular a stranger, nor this device a newcomer a regular", () => {
    expect(visitorStatus({ ...base, welcomedAt: "2026-10-26T09:00:00Z", seenHere: false })).toBe("returning");
    expect(visitorStatus({ ...base, seenHere: true })).toBe("new");
  });

  it("falls back to this device only when the account can't be read", () => {
    expect(visitorStatus({ welcomedAt: null, interviews: null, seenHere: true, known: false })).toBe("returning");
    expect(visitorStatus({ welcomedAt: null, interviews: null, seenHere: false, known: false })).toBe("new");
  });
});

/** Just the calls visitor.ts makes. */
function fakeClient({
  user,
  count = 0,
  countError = null,
}: {
  user: { user_metadata: Record<string, unknown> } | null;
  count?: number;
  countError?: { message: string } | null;
}) {
  const updateUser = vi.fn(async () => ({ data: {}, error: null }));
  const select = vi.fn(async () => ({ count, error: countError }));
  const from = vi.fn(() => ({ select }));
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: "no session" } }), updateUser },
    from,
  } as unknown as SupabaseClient;
  return { client, updateUser, from, select };
}

describe("loadVisitorFacts", () => {
  it("reads the flag from the account and asks nothing more", async () => {
    const { client, from } = fakeClient({ user: { user_metadata: { [WELCOMED_KEY]: "2026-10-26T09:00:00Z" } } });
    expect(await loadVisitorFacts(client)).toMatchObject({ welcomedAt: "2026-10-26T09:00:00Z", known: true });
    expect(from).not.toHaveBeenCalled();
  });

  it("counts the account's interviews when there's no flag", async () => {
    const { client, from, select } = fakeClient({ user: { user_metadata: {} }, count: 2 });
    expect(await loadVisitorFacts(client)).toMatchObject({ welcomedAt: null, interviews: 2, known: true });
    expect(from).toHaveBeenCalledWith("interview_sessions");
    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
  });

  it("knows nothing about a signed-out visitor", async () => {
    const { client } = fakeClient({ user: null });
    expect(await loadVisitorFacts(client)).toMatchObject({ known: false, welcomedAt: null, interviews: null });
  });

  it("leaves the count unknown if it can't be read", async () => {
    const { client } = fakeClient({ user: { user_metadata: {} }, countError: { message: "down" } });
    expect(await loadVisitorFacts(client)).toMatchObject({ known: true, interviews: null });
  });
});

describe("markWelcomed", () => {
  it("writes the flag to the account's own metadata", async () => {
    const { client, updateUser } = fakeClient({ user: { user_metadata: {} } });
    expect(await markWelcomed(client)).toBe(true);
    expect(updateUser).toHaveBeenCalledWith({ data: { [WELCOMED_KEY]: expect.any(String) } });
  });
});
