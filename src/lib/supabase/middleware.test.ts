import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("./env", () => ({ supabaseEnv: () => ({ url: "https://project.supabase.co", key: "publishable" }) }));

import { createServerClient } from "@supabase/ssr";

import { updateSession } from "./middleware";

type CookieWrite = { name: string; value: string; options?: Record<string, unknown> };

/** A Supabase client whose getUser() writes `refreshed`, as a token refresh does. */
function refreshing(refreshed: CookieWrite[]) {
  vi.mocked(createServerClient).mockImplementation(((_url: string, _key: string, options: { cookies: { setAll: (cookies: CookieWrite[]) => void } }) => ({
    auth: {
      getUser: async () => {
        if (refreshed.length) options.cookies.setAll(refreshed);
        return { data: { user: null }, error: null };
      },
    },
  })) as never);
}

beforeEach(() => vi.mocked(createServerClient).mockReset());

describe("updateSession", () => {
  // Server components can't write cookies, so a refreshed token only reaches
  // the browser through this response.
  it("puts a refreshed token on the response", async () => {
    refreshing([{ name: "sb-token", value: "fresh", options: { path: "/" } }]);
    const res = await updateSession(new NextRequest("https://app.test/dashboard", { headers: { cookie: "sb-token=stale" } }));
    expect(res.cookies.get("sb-token")?.value).toBe("fresh");
  });

  it("lets the request through untouched when nothing was refreshed", async () => {
    refreshing([]);
    const res = await updateSession(new NextRequest("https://app.test/dashboard", { headers: { cookie: "sb-token=current" } }));
    expect(res.status).toBe(200);
    expect(res.cookies.getAll()).toEqual([]);
  });
});
