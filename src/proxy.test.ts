import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import { config } from "./proxy";

/** Matched the way Next matches it. */
const refreshesOn = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("the proxy", () => {
  it("refreshes the session for pages", () => {
    for (const url of ["/", "/dashboard", "/login", "/interview/new", "/interview/abc/report"]) expect(refreshesOn(url), url).toBe(true);
  });

  // Each refresh is a Supabase round trip: route handlers authenticate
  // themselves, and models, fonts and sounds need no session.
  it("skips the API, Next's own assets and static files", () => {
    for (const url of [
      "/api/sessions",
      "/_next/static/chunks/app.js",
      "/favicon.ico",
      "/images/desk.png",
      "/models/recruiter.glb",
      "/fonts/helvetiker.json",
      "/audio/ack/ack-01.mp3",
    ]) {
      expect(refreshesOn(url), url).toBe(false);
    }
  });
});
