/**
 * Whether Ms. Crystal has met this user before, kept with their account (so a
 * new browser or a cleared one doesn't make them a stranger), and which line
 * she said last (per device: only so she doesn't say it twice running).
 *
 * The account keeps it in its own auth metadata (`jobme_welcomed_at`): no
 * table or migration, and every user can write their own. Someone who has
 * interviewed here already counts as returning, flag or not.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type VisitorStatus = "new" | "returning";

export const WELCOMED_KEY = "jobme_welcomed_at";
/** This device's fallback when the account can't be asked (signed out, offline). */
const SEEN_HERE_KEY = "jobme:reception-seen";
const LAST_LINE_KEY = "jobme:reception-last";

export interface VisitorFacts {
  /** The account's flag, or null if it has none or couldn't be read. */
  welcomedAt: string | null;
  /** Their interviews so far; null if unknown. */
  interviews: number | null;
  /** This device has seen her greet someone before. */
  seenHere: boolean;
  /** The account could be read at all. */
  known: boolean;
}

/** New only when the account says so: no flag and no interviews. The device decides only when the account can't. */
export function visitorStatus({ welcomedAt, interviews, seenHere, known }: VisitorFacts): VisitorStatus {
  if (welcomedAt || (interviews ?? 0) > 0) return "returning";
  if (!known) return seenHere ? "returning" : "new";
  return "new";
}

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode: she may repeat herself, nothing more.
  }
}

/** What this device alone says, for when the account is slow to answer. */
export function deviceStatus(): VisitorStatus {
  return visitorStatus({ welcomedAt: null, interviews: null, seenHere: readLocal(SEEN_HERE_KEY) !== null, known: false });
}

/** Reads what decides the user's status; never throws. */
export async function loadVisitorFacts(supabase: SupabaseClient): Promise<VisitorFacts> {
  const seenHere = readLocal(SEEN_HERE_KEY) !== null;
  try {
    // getUser() asks the server, so the flag is the account's latest.
    const { data, error } = await supabase.auth.getUser();
    const user = error ? null : data.user;
    if (!user) return { welcomedAt: null, interviews: null, seenHere, known: false };
    const welcomedAt = typeof user.user_metadata?.[WELCOMED_KEY] === "string" ? (user.user_metadata[WELCOMED_KEY] as string) : null;
    if (welcomedAt) return { welcomedAt, interviews: null, seenHere, known: true };
    const { count, error: countError } = await supabase.from("interview_sessions").select("id", { count: "exact", head: true });
    return { welcomedAt: null, interviews: countError ? null : (count ?? 0), seenHere, known: true };
  } catch {
    return { welcomedAt: null, interviews: null, seenHere, known: false };
  }
}

/** Marks the user as greeted, on their account and on this device. False if the account couldn't be told. */
export async function markWelcomed(supabase: SupabaseClient): Promise<boolean> {
  writeLocal(SEEN_HERE_KEY, new Date().toISOString());
  try {
    const { error } = await supabase.auth.updateUser({ data: { [WELCOMED_KEY]: new Date().toISOString() } });
    return !error;
  } catch {
    return false;
  }
}

export function lastLineId(): string | null {
  return readLocal(LAST_LINE_KEY);
}

export function rememberLine(id: string): void {
  writeLocal(LAST_LINE_KEY, id);
}
