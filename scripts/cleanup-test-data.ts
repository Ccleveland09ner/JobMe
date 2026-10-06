/**
 * Removes end-to-end test data: `npm run cleanup:test` (add --dry-run first).
 *
 * Deletes every row EXPLICITLY, in foreign-key order, rather than deleting the
 * auth user and trusting `on delete cascade`. Two reasons:
 *
 *   - A cascade only fires for rows whose FK actually points at the user. A
 *     row orphaned by an earlier partial failure is invisible to it and stays
 *     forever.
 *   - It fails silently. Deleting the user "succeeds" whether or not the
 *     cascade reached anything, so a missing grant looks like a clean run —
 *     which is exactly how a `permission denied for table resumes` went
 *     unnoticed.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY, and the grants in
 * 20261005120000_service_role_grants.sql.
 */

import { createClient } from "@supabase/supabase-js";

import { loadEnv, requireEnv } from "./_env";

/** Addresses the e2e harnesses mint. Nothing else is ever touched. */
export const TEST_EMAIL_PATTERN = /^jobme-[a-z0-9-]*e2e@example\.com$/i;

export function isTestEmail(email: string | undefined): boolean {
  return Boolean(email && TEST_EMAIL_PATTERN.test(email.trim()));
}

/**
 * Child tables before parents, so a delete never depends on a cascade and a
 * permission failure surfaces on the table that actually lacks the grant.
 */
export const DELETE_ORDER = [
  "reports",
  "turns",
  "interview_sessions",
  "resume_chunks",
  "resumes",
  "profiles",
] as const;

/** `profiles` is keyed by the user id; every other table carries `user_id`. */
export function ownerColumn(table: string): "id" | "user_id" {
  return table === "profiles" ? "id" : "user_id";
}

export interface CleanupResult {
  users: number;
  deleted: Record<string, number>;
  errors: string[];
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes("--dry-run");

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const secret = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.listUsers();
  if (error) {
    console.error(`FAIL listing users: ${error.message}`);
    process.exit(1);
  }

  const targets = (data?.users ?? []).filter((u) => isTestEmail(u.email));
  console.log(
    `${targets.length} test user(s)${dryRun ? " — dry run, nothing will be deleted" : ""}`,
  );
  if (targets.length === 0) {
    console.log("Nothing to clean.");
    return;
  }

  const result: CleanupResult = { users: 0, deleted: {}, errors: [] };

  for (const user of targets) {
    console.log(`\n  ${user.email}`);

    for (const table of DELETE_ORDER) {
      const column = ownerColumn(table);

      if (dryRun) {
        const { count, error: countError } = await admin
          .from(table)
          .select("*", { count: "exact", head: true })
          .eq(column, user.id);
        if (countError) result.errors.push(`${table}: ${countError.message}`);
        console.log(`    ${table.padEnd(20)} would delete ${count ?? 0}`);
        continue;
      }

      const { data: removed, error: delError } = await admin
        .from(table)
        .delete()
        .eq(column, user.id)
        .select("*");

      if (delError) {
        result.errors.push(`${table}: ${delError.message}`);
        console.log(`    ${table.padEnd(20)} FAILED ${delError.message}`);
        continue;
      }
      const n = removed?.length ?? 0;
      result.deleted[table] = (result.deleted[table] ?? 0) + n;
      console.log(`    ${table.padEnd(20)} deleted ${n}`);
    }

    if (!dryRun) {
      const { error: userError } = await admin.auth.admin.deleteUser(user.id);
      if (userError) result.errors.push(`auth user: ${userError.message}`);
      else result.users++;
      console.log(`    ${"auth user".padEnd(20)} ${userError ? "FAILED" : "deleted"}`);
    }
  }

  console.log("");
  if (result.errors.length) {
    console.error(`${result.errors.length} error(s):`);
    for (const e of result.errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(
    dryRun
      ? "Dry run complete."
      : `Removed ${result.users} user(s) and their rows.`,
  );
}

// Only run when invoked directly, so the test can import the helpers.
if (process.argv[1]?.includes("cleanup-test-data")) void main();

export {};
