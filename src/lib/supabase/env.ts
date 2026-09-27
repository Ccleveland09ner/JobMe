/**
 * Supabase connection values, tolerant of both key names.
 *
 * Supabase renamed the browser-safe key from "anon key" to "publishable key".
 * Their current dashboard and docs hand you `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
 * while this starter was written against `NEXT_PUBLIC_SUPABASE_ANON_KEY`. They
 * are the same value, so we accept either and prefer the newer name.
 *
 * Both names are referenced as literals on purpose: Next inlines
 * `process.env.NEXT_PUBLIC_*` at build time by textual substitution, so a
 * computed lookup like `process.env[name]` would resolve to undefined in the
 * browser bundle.
 */

/**
 * Prefixed names come FIRST because they are the only ones that work in the
 * browser: Next.js inlines `NEXT_PUBLIC_*` at build time by textual
 * substitution, so the unprefixed fallbacks resolve to undefined client-side
 * and are effectively server-only aliases.
 */
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY;

/**
 * Throws with an actionable message rather than letting `undefined` reach the
 * Supabase client, which fails later with a much less obvious error.
 */
export function supabaseEnv(): { url: string; key: string } {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      !SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL, server only)",
      !SUPABASE_PUBLISHABLE_KEY &&
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or SUPABASE_PUBLISHABLE_KEY, server only)",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Supabase is not configured. Missing: ${missing}. ` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }
  return { url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY };
}
