"use server";

/**
 * Signing out from inside the building: clears the session, then a client-side
 * navigation to /login, so the 3D building (already at the front door) stays
 * loaded instead of being rebuilt by a full page load. Deleting the auth
 * cookies in an action also clears the router's client cache, so Back can't
 * bring a signed-in page back. The /logout route is the plain form post, for
 * when this can't run.
 */

import { redirect, RedirectType } from "next/navigation";

import { createClient } from "./server";

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) console.error(`[logout] sign-out failed: ${error.message}`);
  redirect("/login", RedirectType.replace);
}
