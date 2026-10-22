/**
 * `npm run compare:plans` — prints the interview each kind of job input
 * produces, so you can check that role-specific inputs lead to materially
 * different, relevant questions.
 *
 * Runs session creation's preparation exactly as POST /api/sessions does —
 * role family and seniority from the title, role defaults, then one LIVE
 * question-plan call — for a Software Engineering Intern posting, a Product
 * Manager Intern posting, a title alone, nothing at all and a description too
 * short to use. Then the two link failures, which the route turns into a
 * "paste the description instead" error rather than a silently generic
 * interview. `--offline` skips the model and shows the role defaults alone.
 *
 * Ref: docs/Scoring-Rubric.md > Question selection
 */

import {
  generateQuestionPlan,
  plannedBankOpening,
  purposeFor,
  usableJobText,
} from "../src/lib/ai/question-plan";
import { questionFor } from "../src/lib/engine/bank";
import { defaultTopics, inferSeniority, roleFamily } from "../src/lib/engine/roles";
import { TOPIC_KINDS } from "../src/lib/engine/types";
import { JobLinkError, fetchJobPosting } from "../src/lib/job-posting";
import { PLAN_CASES } from "./calibration-fixtures";
import { loadEnv } from "./_env";

loadEnv();

const OFFLINE = process.argv.includes("--offline");
const PACE_MS = 4300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fixed, so the defaults print the same every run. */
const seeded = () => {
  let s = 42;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
};

async function main() {
  let calls = 0;
  for (const c of PLAN_CASES) {
    const jobText = usableJobText(c.jobText);
    const family = roleFamily(c.targetRole, jobText);
    const seniority = inferSeniority(c.targetRole, jobText);
    const defaults = defaultTopics(family, 4, seeded());

    const inputs = {
      topics: defaults,
      family,
      resumeItems: [],
      targetRole: c.targetRole,
      company: c.company,
      jobText,
      seniority,
    };
    if (!OFFLINE && calls++ > 0) await sleep(PACE_MS);
    const plan = OFFLINE
      ? null
      : await generateQuestionPlan(inputs, undefined);
    const topics = plan?.order?.length ? plan.order : defaults;

    console.log(`\n${c.label}`);
    console.log(
      `  family: ${family} · level: ${seniority ?? "not stated"} · company: ${c.company ?? "none"} · ` +
        `personalised: ${plan?.job?.generated === true}`,
    );
    if (c.jobText && !jobText) console.log("  (job description too short to use — ignored)");
    for (const t of topics) {
      const planned = plannedBankOpening(plan, t, 1, []);
      console.log(`  [${planned ? "tailored" : "bank    "}] ${t} (${TOPIC_KINDS[t]}): ${planned ?? questionFor(t, 1)}`);
      console.log(`             assesses: ${purposeFor(plan, t)}`);
    }
  }

  console.log("\nLinks that cannot be read");
  for (const [label, url, fetcher] of [
    ["unsupported site", "https://www.linkedin.com/jobs/view/123456", undefined],
    [
      "supported site, fetch fails",
      "https://boards.greenhouse.io/acme/jobs/1",
      (async () => new Response("not found", { status: 404 })) as typeof fetch,
    ],
  ] as const) {
    try {
      await fetchJobPosting(url, fetcher);
      console.log(`  ${label}: read (unexpected)`);
    } catch (err) {
      const e = err as JobLinkError;
      console.log(`  ${label}: ${e.code} — "${e.message}"`);
    }
  }
  console.log(`\n${calls} model call(s).`);
}

void main();

export {};
