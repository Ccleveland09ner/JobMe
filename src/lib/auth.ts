/**
 * Auth guard used by every protected page and route.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > Components > Auth and Profile
 *
 * This is load-bearing now that `src/proxy.ts` no longer matches `/api/*`:
 * route handlers authenticate themselves here rather than relying on session
 * refresh middleware, which was costing a `getUser()` round trip on every
 * request including the ones with the tightest latency budgets.
 */

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export interface AuthedUser {
  id: string;
  email?: string;
}

/**
 * For Server Components and pages. Redirects to /login when signed out.
 *
 * Uses `getUser()`, which revalidates the token with Supabase, and NOT
 * `getSession()` — that reads the cookie without verifying it, so it must
 * never be trusted in server code.
 */
export async function requireUser(): Promise<AuthedUser> {
  const user = await getUserOrNull();
  if (!user) redirect("/login");
  return user;
}

/** For route handlers: returns null so the caller can answer 401 JSON. */
export async function getUserOrNull(): Promise<AuthedUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return { id: user.id, email: user.email ?? undefined };
}

export const UNAUTHORIZED = { error: "Unauthorized" } as const;
