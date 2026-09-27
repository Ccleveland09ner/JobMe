/**
 * Auth guard for every protected page and route. Load-bearing now that
 * `proxy.ts` no longer matches `/api/*`: handlers authenticate here instead of
 * relying on middleware that cost a `getUser()` round trip on every request.
 *
 * Ref: TechDesign > Components > Auth and Profile
 */

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export interface AuthedUser {
  id: string;
  email?: string;
}

/**
 * Pages and Server Components; redirects when signed out. Uses `getUser()`,
 * which revalidates the token — NOT `getSession()`, which reads the cookie
 * without verifying it and must never be trusted server-side.
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
