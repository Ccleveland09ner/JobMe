/**
 * `npm run compare:plans` — prints the interview each kind of job input
 * produces, so you can check that role-specific inputs lead to materially
 * different, relevant questions.
 *
 * Runs session creation's preparation exactly as POST /api/sessions does
 * (lib/interview/start.ts) — role family and seniority from the title, role
 * defaults, then one LIVE question-plan call — for a Software Engineering
 * Intern posting, a Product Manager Intern posting, a title alone, nothing at
 * all and a description too short to use. Then the two link failures, which
 * the route turns into a "paste the description instead" error rather than a
 * silently generic interview. `--offline` skips the model and shows the role
 * defaults alone.
 *
 * Ref: docs/Scoring-Rubric.md > Question selection
 */

import "./_load-env";

import {
  fallbackPlan,
  generateQuestionPlan,
  plannedBankOpening,
  purposeFor,
  usableJobText,
} from "../src/lib/ai/question-plan";
import { questionFor } from "../src/lib/engine/bank";
import { defaultTopics, inferSeniority, roleFamily } from "../src/lib/engine/roles";
import { TOPIC_KINDS } from "../src/lib/engine/types";
import { startInterview } from "../src/lib/interview/start";
import { JobLinkError, fetchJobPosting } from "../src/lib/job-posting";
import { PLAN_CASES } from "./calibration-fixtures";
import { PACE_MS, sleep } from "./_pace";

const OFFLINE = process.argv.includes("--offline");

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
    // Printed only; startInterview decides them again, the same way.
    const jobText = usableJobText(c.jobText);
    const family = roleFamily(c.targetRole, jobText);
    const seniority = inferSeniority(c.targetRole, jobText);

    if (!OFFLINE && calls++ > 0) await sleep(PACE_MS);
    const started = await startInterview(
      {
        displayName: "Compare",
        mode: "quick",
        ...(c.targetRole && { targetRole: c.targetRole }),
        ...(c.company && { company: c.company }),
        ...(c.jobText && { roleText: c.jobText }),
      },
      {
        store: {
          saveProfile: async () => {},
          loadResume: async () => null,
          insertSession: async () => ({ id: "compare" }),
        },
        fetchPosting: async () => {
          throw new Error("no posting links here");
        },
        // Offline: what a failed plan call leaves the interview with.
        generatePlan: OFFLINE ? async (inputs) => fallbackPlan(inputs) : (inputs) => generateQuestionPlan(inputs),
        defaultTopics: (f, n) => defaultTopics(f, n, seeded()),
      },
    );
    if (started.kind !== "created") throw new Error(`${c.label}: ${started.kind}`);
    const { plan, personalized } = started;
    const topics = started.state.topics;

    console.log(`\n${c.label}`);
    console.log(
      `  family: ${family} · level: ${seniority ?? "not stated"} · company: ${c.company ?? "none"} · ` +
        `personalised: ${personalized}`,
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
