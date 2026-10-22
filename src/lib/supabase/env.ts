/**
 * Supabase connection values (the anon key is now the publishable key). Literal
 * process.env references, since Next inlines NEXT_PUBLIC_* textually.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Fails here with a clear message rather than deeper with an opaque one. */
export function supabaseEnv(): { url: string; key: string } {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      !SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
      !SUPABASE_PUBLISHABLE_KEY &&
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
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
