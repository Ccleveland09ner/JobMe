import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";

import { POST } from "./route";

const signOut = vi.fn();
beforeEach(() => {
  signOut.mockReset().mockResolvedValue({ error: null });
  vi.mocked(createClient).mockResolvedValue({ auth: { signOut } } as never);
});

describe("POST /logout", () => {
  // 303, not 307: a 307 repeats the sign-out form's POST against /login.
  it("signs out and sends the browser to /login with a GET", async () => {
    const res = await POST(new Request("https://app.test/logout", { method: "POST" }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://app.test/login");
  });

  it("still sends the browser on when signing out fails, and logs why", async () => {
    signOut.mockResolvedValue({ error: { message: "network" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(new Request("https://app.test/logout", { method: "POST" }));
    expect(res.status).toBe(303);
    expect(log.mock.calls[0][0]).toContain("network");
    log.mockRestore();
  });
});
