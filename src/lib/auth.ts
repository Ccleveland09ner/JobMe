/** Auth guards. Route handlers authenticate here (proxy.ts skips /api). */

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export interface AuthedUser {
  id: string;
  email?: string;
}

/**
 * For pages: redirects when signed out. Uses getUser(), which verifies the
 * token (getSession() doesn't, so never trust it server-side).
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
