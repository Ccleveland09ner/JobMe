/**
 * Connectivity and schema diagnostic: `npm run check:db`
 *
 * Answers three questions that otherwise fail late and confusingly:
 *   1. Are the env vars present, under either key name?
 *   2. Is the project reachable (and awake — free projects pause after a week
 *      of inactivity, which looks like a network error)?
 *   3. Has the schema migration actually been applied?
 *
 * Read-only. Safe to run any time.
 */

import { createClient } from "@supabase/supabase-js";

import { loadEnv } from "./_env";

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const EXPECTED_TABLES = [
  "profiles",
  "interview_sessions",
  "turns",
  "reports",
  "resumes",
  "resume_chunks",
] as const;

async function main(): Promise<void> {
  console.log("Supabase check\n");

  if (!url || !key) {
    console.error("  FAIL  env not configured.");
    console.error(`        NEXT_PUBLIC_SUPABASE_URL: ${url ? "set" : "MISSING"}`);
    console.error(
      `        publishable/anon key:      ${key ? "set" : "MISSING"}`,
    );
    process.exit(1);
  }

  console.log(`  host: ${new URL(url).host}`);
  console.log(
    `  key:  present (${key.length} chars, ` +
      `${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? "publishable" : "legacy anon"} name)`,
  );

  const supabase = createClient(url, key);

  const { error: authError } = await supabase.auth.getSession();
  if (authError) {
    console.error(`\n  FAIL  auth unreachable: ${authError.message}`);
    console.error("        A paused free project looks exactly like this.");
    console.error("        Open the Supabase dashboard to wake it, then retry.");
    process.exit(1);
  }
  console.log("  auth: reachable\n");

  let missing = 0;
  for (const table of EXPECTED_TABLES) {
    /**
     * A real GET, NOT `{ head: true }`.
     *
     * A HEAD response carries no body, so PostgREST's JSON error payload never
     * reaches supabase-js and `error` stays null even for a table that does
     * not exist. This script previously used `head: true` and cheerfully
     * reported a completely empty database as fully migrated.
     */
    const { error } = await supabase.from(table).select("*").limit(1);

    if (!error) {
      console.log(`  ok        ${table}`);
      continue;
    }

    /**
     * `42501 permission denied` means the table EXISTS and the grants are
     * doing their job — this script authenticates with the publishable key
     * and no user session, so it acts as `anon`, and JobMe grants nothing to
     * `anon` because it has no public data.
     *
     * A genuinely missing table reports PGRST205 (PostgREST cannot find it in
     * its schema cache) or 42P01.
     */
    if (error.code === "42501") {
      console.log(`  ok        ${table.padEnd(20)} (exists; anon correctly denied)`);
      continue;
    }

    missing++;
    console.log(`  ABSENT    ${table.padEnd(20)} (${error.code ?? "?"})`);
  }

  if (missing) {
    console.log(
      `\n  ${missing}/${EXPECTED_TABLES.length} table(s) missing — a migration has not been applied.`,
    );
    console.log("\n  Either paste the unapplied file(s) from supabase/migrations/");
    console.log("  into the dashboard SQL Editor, or link the CLI:");
    console.log("    npx supabase login");
    console.log(`    npx supabase link --project-ref ${new URL(url).host.split(".")[0]}`);
    console.log("    npx supabase db push --linked");
    process.exit(1);
  }

  console.log("\n  Schema is applied.");
}

void main();

export {};
