/** The candidate's profile as setup and settings read it, and the one write settings makes. */

import { LIMITS } from "../schemas";
import type { RowReader } from "../supabase/reader";

export interface Profile {
  /** What the recruiter calls them: the saved name, else the start of their email. */
  displayName: string;
  username: string | null;
  memberCode: string | null;
}

export function displayNameFor(saved: string | null | undefined, email: string | null | undefined): string {
  return saved?.trim() || email?.split("@")[0] || "";
}

/** Not essential: a failed read falls back to the email name. */
export async function loadProfile(supabase: RowReader, user: { id: string; email?: string | null }): Promise<Profile> {
  const { data, error } = await supabase.from("profiles").select("display_name, username, member_code").eq("id", user.id).maybeSingle();
  const row = error ? null : (data as { display_name: string | null; username: string | null; member_code: string | null } | null);
  return {
    displayName: displayNameFor(row?.display_name, user.email),
    username: row?.username ?? null,
    memberCode: row?.member_code ?? null,
  };
}

export type SaveNameOutcome = { ok: true } | { ok: false; message: string };

/** Saves the name the recruiter uses, held to the same limit interview setup checks. */
export async function saveDisplayName(supabase: RowReader, userId: string, name: string): Promise<SaveNameOutcome> {
  const next = name.trim();
  if (!next) return { ok: false, message: "Your name can't be empty." };
  if (next.length > LIMITS.displayName) return { ok: false, message: `Keep it to ${LIMITS.displayName} characters.` };
  const { error } = await supabase.from("profiles").update({ display_name: next }).eq("id", userId);
  return error ? { ok: false, message: "We couldn't save that. Try again in a moment." } : { ok: true };
}
