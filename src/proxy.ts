import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

/**
 * `api/` is excluded deliberately.
 *
 * `updateSession` calls `getUser()`, which is a network round trip to Supabase
 * (~100-270ms). Left in the matcher it ran on EVERY route handler, spending
 * that on each turn (budget: 1.5s) and each TTS request (budget: 0.6s first
 * byte) purely to refresh a cookie the route is about to authenticate anyway.
 *
 * Route handlers therefore authenticate themselves via `requireUser()` /
 * `getUserOrNull()` in `src/lib/auth.ts`. Pages still get session refresh here.
 *
 * Note: this only skips the session-refresh middleware. It does NOT skip the
 * transport-level body cap from `proxyClientMaxBodySize` in next.config.ts, so
 * /api/resume must still validate its own payload size.
 */
export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
