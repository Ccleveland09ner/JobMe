import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

/**
 * `api/` is excluded deliberately. `updateSession` calls `getUser()`, a
 * ~100-270ms round trip to Supabase, and in the matcher it ran on every route
 * handler — spending that on each turn (1.5s budget) and each TTS request
 * (0.6s first byte) to refresh a cookie the route authenticates anyway.
 *
 * Route handlers authenticate themselves via `lib/auth.ts`; pages still get
 * session refresh here.
 *
 * This only skips the middleware, NOT the transport-level body cap from
 * `proxyClientMaxBodySize`, so /api/resume still validates its own size.
 */
export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
