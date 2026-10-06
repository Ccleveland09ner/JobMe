/**
 * `npm run check:db` — read-only, safe any time. Answers three things that
 * otherwise fail late and confusingly: are the env vars present, is the
 * project reachable and awake (free projects pause after a week, which looks
 * like a network error), and has the schema actually been applied?
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

  /**
   * A real network request, NOT `auth.getSession()`.
   *
   * `getSession()` reads the local session and returns without touching the
   * network, so it reported "reachable" against a project whose DNS had been
   * withdrawn — and every table then looked ABSENT, blaming the schema for a
   * paused project. Detecting exactly that is the point of this check, so it
   * has to actually make a request.
   */
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      /**
       * The gateway answered but the service behind it did not. A restoring
       * project sits here for minutes: 502 from auth, 521 from PostgREST.
       * Calling that "reachable" and moving on makes a WAKING project look
       * like an unmigrated one, which is the same misreading this check was
       * rewritten to stop.
       */
      console.error(
        `\n  FAIL  project is waking, not ready (auth health ${res.status}).`,
      );
      console.error("        Services behind the gateway are still starting.");
      console.error("        Wait for ACTIVE_HEALTHY and retry:");
      console.error("          npx supabase projects list");
      process.exit(1);
    }
    console.log(`  reachable: yes (auth health ${res.status})` + "\n");
  } catch (err) {
    const cause = (err as Error & { cause?: Error }).cause?.message ?? "";
    console.error(`\n  FAIL  project unreachable: ${(err as Error).message}`);
    if (/ENOTFOUND|EAI_AGAIN/.test(cause)) {
      console.error("        DNS does not resolve this project at all.");
      console.error("        A PAUSED free project looks exactly like this —");
      console.error("        Supabase withdraws the hostname while it sleeps.");
      console.error("        Restore it from the dashboard, then retry.");
    } else if (cause) {
      console.error(`        cause: ${cause}`);
    }
    process.exit(1);
  }

  let missing = 0;
  for (const table of EXPECTED_TABLES) {
    /**
     * A real GET, NOT `{ head: true }`: a HEAD response carries no body, so
     * PostgREST's JSON error never reaches supabase-js and `error` stays null
     * even for a missing table. This script once reported a completely empty
     * database as fully migrated.
     */
    const { error } = await supabase.from(table).select("*").limit(1);

    if (!error) {
      console.log(`  ok        ${table}`);
      continue;
    }

    /**
     * `42501` means the table EXISTS and grants are working: this script has
     * no user session, so it acts as `anon`, and JobMe grants `anon` nothing.
     * A genuinely missing table reports PGRST205 or 42P01.
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
