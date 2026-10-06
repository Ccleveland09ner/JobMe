/**
 * End-to-end verification against the real stack: `npm run verify:live`
 *
 * Drives the actual HTTP routes with a real resume PDF, a real job
 * description, the real model and the real database — the one thing unit
 * tests and the offline rehearsal cannot do.
 *
 * PERMANENT on purpose. The previous version of this was a throwaway, deleted
 * after it ran, which is why a week later there was nothing to re-run when the
 * project came back from a pause.
 *
 * Needs the dev server on :3000, SUPABASE_SERVICE_ROLE_KEY to mint a test
 * user, and GEMINI_API_KEY. Paced for the free tier's 15 requests/minute.
 *
 *   npm run verify:live
 *   npm run verify:live -- --quick     (quick mode, fewer calls)
 */

import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { loadEnv, requireEnv } from "./_env";

loadEnv();

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const PDF = process.env.VERIFY_PDF ?? "docs/Chawana_Kazunda_TMCF_Resume.pdf";
const MODE = process.argv.includes("--quick") ? "quick" : "full";
const PACE_MS = 4300;
/** A runaway guard, not a budget: the cap should stop the interview first. */
const MAX_TURNS = Number(process.env.VERIFY_MAX_TURNS ?? 40);

const EMAIL = "jobme-live-e2e@example.com";
const PASSWORD = "live-e2e-verification-8891";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}
function heading(t: string): void {
  console.log(`\n${"=".repeat(72)}\n${t}\n${"=".repeat(72)}`);
}

const JOB_DESCRIPTION = `
Software Engineering Intern — Backend
You will build and maintain REST APIs, write SQL against Postgres, and improve
the reliability of services processing millions of records a day. You will work
in a small team, pair with senior engineers, and own a feature end to end.
Required: Python or Java, SQL, Git, and some exposure to cloud services.
Nice to have: React, Docker, experience with data pipelines or automation.
We value candidates who explain trade-offs, take ownership, and communicate
clearly with non-technical stakeholders.
`.trim();

/** Must not survive redaction. Checked by absence, never printed raw. */
const MUST_NOT_SURVIVE: [string, RegExp][] = [
  ["email address", /[\w.+-]+@[\w-]+\.[\w.]{2,}/],
  ["http(s) link", /https?:\/\//i],
  ["linkedin profile", /linkedin\.com\/in\//i],
  ["github profile", /github\.com\/[\w-]/i],
];

/** Must survive: these are what the impact and specificity scores read. */
const MUST_SURVIVE = ["GPA 3.81", "Computer Science"];

/** Varied, so the model is not scoring the same text every turn. */
const ANSWERS = [
  "At my internship I owned the data ingestion pipeline. It was dropping " +
    "about 4% of records silently because the retry logic swallowed " +
    "exceptions. I added structured logging first so we could see the " +
    "failures, then rewrote the retry with exponential backoff and a dead " +
    "letter queue. Loss went from 4% to under 0.1%.",
  "We were three people on a class project with five weeks. I owned the " +
    "backend API. Queries got slow as the dataset grew and it took us a " +
    "while to work out what was happening.",
  "I had to learn Docker over a weekend because our deploy target changed. " +
    "I read the layer caching model first rather than copying commands, " +
    "which is why I spotted that our image rebuilt dependencies on every " +
    "push. Fixing the layer order cut build time from 9 minutes to under 2.",
  "We shipped it and it went well for everyone involved.",
  "Our tech lead wanted to ship without testing the migration. I laid out " +
    "the rollback cost and proposed a staging dry run instead. It caught two " +
    "broken constraints, so we shipped a day late rather than rolling back " +
    "in production.",
];

interface TurnRow {
  seq: number;
  move: string;
  band: string;
  source: string;
  covered: number;
  total: number;
  q: number;
  cap: number;
  ms: number;
  degraded: boolean;
}

async function main(): Promise<void> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const secret = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const pub = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

  console.log(`Live verification — ${MODE} mode against ${BASE}`);

  const admin = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });

  const anon = createClient(url, pub, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error: signInError } =
    await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (signInError || !signIn.session) {
    console.error(`FAIL sign in: ${signInError?.message}`);
    process.exit(1);
  }

  // @supabase/ssr reads the session from sb-<ref>-auth-token.
  const ref = new URL(url).host.split(".")[0];
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(
    JSON.stringify(signIn.session),
  ).toString("base64url")}`;

  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { cookie, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON */
    }
    return { status: res.status, json, text };
  };

  // ---- 1. ingestion -----------------------------------------------------
  heading("1. POST /api/resume — real PDF, real job description");

  const pdf = readFileSync(PDF);
  const form = new FormData();
  form.append("file", new Blob([pdf], { type: "application/pdf" }), "resume.pdf");
  form.append("roleText", JOB_DESCRIPTION);

  const t0 = Date.now();
  const upRes = await fetch(`${BASE}/api/resume`, {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  const upText = await upRes.text();
  const ingestMs = Date.now() - t0;
  let up: Record<string, unknown> = {};
  try {
    up = JSON.parse(upText);
  } catch {
    /* non-JSON */
  }

  console.log(`  ${Math.round(pdf.length / 1024)} KB -> ${upRes.status} in ${ingestMs}ms`);
  if (upRes.status !== 200) {
    console.error(`  ${upText.slice(0, 400)}`);
    process.exit(1);
  }

  const resumeId = up.resumeId as string;
  const preview = String(up.extractedPreview ?? "");
  const chunkCount = Number(up.chunkCount);
  const coverage = (up.coverage ?? []) as {
    id: string;
    kind: string;
    label: string;
    relevance: number;
  }[];

  check("parsed the PDF", Boolean(up.pageCount), `${up.pageCount} page(s)`);
  check("distilled resume facts", up.hasFacts === true);
  check("read the job description", Boolean(up.role),
    JSON.stringify(up.role ?? null));

  // ---- 2. extraction repair (fix 3) -------------------------------------
  heading("2. PDF extraction repair — fix 3");
  const headings = preview
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[A-Z][A-Z \t&/'-]{2,}$/.test(l));
  console.log(`  headings: ${headings.join(" | ") || "(none in preview)"}`);
  check("no letter-spaced heading survives",
    !headings.some((h) => /\b[A-Z]{1,3}\s+[A-Z]{1,3}\b/.test(h)));
  check("chunk count rose from the pre-fix 4", chunkCount > 4,
    `${chunkCount} chunks`);

  // ---- 3. redaction -----------------------------------------------------
  heading("3. Redaction — by absence");
  console.log(`  removed: ${JSON.stringify(up.redacted ?? {})}`);
  for (const [label, re] of MUST_NOT_SURVIVE) {
    check(`no ${label} survives`, !re.test(preview));
  }
  for (const kept of MUST_SURVIVE) {
    check(`keeps "${kept}" — the scoring signal`, preview.includes(kept));
  }

  // ---- 4. ranking (fix 2) -----------------------------------------------
  heading("4. Relevance ranking — fix 2");
  for (const item of coverage) {
    console.log(
      `  ${item.relevance.toFixed(6).padStart(10)}  ${item.kind.padEnd(8)} ${item.label}`,
    );
  }
  const scores = coverage.map((c) => c.relevance);
  check("items found", coverage.length > 0, `${coverage.length} items`);
  check("descending order",
    JSON.stringify(scores) === JSON.stringify([...scores].sort((a, b) => b - a)));
  check("scores are distinct, not flattened",
    new Set(scores).size === scores.length,
    `${new Set(scores).size} distinct of ${scores.length}`);

  const roles = coverage.filter((c) => c.kind === "role").map((c) => c.relevance);
  const projects = coverage.filter((c) => c.kind === "project").map((c) => c.relevance);
  check("roles and projects both present",
    roles.length > 0 && projects.length > 0,
    `${roles.length} roles / ${projects.length} projects`);

  // ---- 5. session + turns (fix 1) ---------------------------------------
  heading(`5. POST /api/sessions — ${MODE} mode, with resume`);
  const create = await call("POST", "/api/sessions", {
    displayName: "Chawana",
    mode: MODE,
    resumeId,
    roleText: JOB_DESCRIPTION,
  });
  if (create.status !== 200) {
    console.error(`  ${create.status}: ${create.text.slice(0, 400)}`);
    process.exit(1);
  }
  const sessionId = create.json.sessionId as string;
  const progress0 = create.json.progress as Record<string, number>;
  const q1 = create.json.question as { text: string; source?: string };

  check("mode honoured", create.json.mode === MODE);
  check("coverageTotal matches what will be covered",
    progress0.coverageTotal === coverage.length,
    `${progress0.coverageTotal} to cover, cap ${progress0.questionCap}`);
  console.log(`\n  Q1 (${q1.source ?? "?"}): ${q1.text}`);

  heading("6. Turns — to completion, paced for 15 RPM");
  const rows: TurnRow[] = [];
  let turnSeq = 1;
  let done = false;

  for (let i = 0; i < MAX_TURNS && !done; i++) {
    if (i > 0) await sleep(PACE_MS);
    const started = Date.now();
    const turn = await call("POST", `/api/sessions/${sessionId}/turns`, {
      transcript: ANSWERS[i % ANSWERS.length],
      holdMs: 32000,
      captureMs: 26000,
      clientTurnSeq: turnSeq,
    });
    const ms = Date.now() - started;

    if (turn.status !== 200) {
      console.error(`  turn ${turnSeq}: HTTP ${turn.status} ${turn.text.slice(0, 200)}`);
      failures++;
      break;
    }

    const np = turn.json.notepad as Record<string, unknown>;
    const next = turn.json.next as { text: string; source: string; type: string } | null;
    const p = turn.json.progress as Record<string, number>;

    rows.push({
      seq: turnSeq,
      move: String(turn.json.move),
      band: String(np?.band ?? "-"),
      source: next?.source ?? "-",
      covered: p.coverageDone,
      total: p.coverageTotal,
      q: p.questionCount,
      cap: p.questionCap,
      ms,
      degraded: Boolean(np?.degraded),
    });

    console.log(
      `  ${String(turnSeq).padStart(2)}  ${rows.at(-1)!.move.padEnd(8)}` +
        ` band=${rows.at(-1)!.band.padEnd(8)} next=${(next?.source ?? "-").padEnd(6)}` +
        ` cover=${p.coverageDone}/${p.coverageTotal} q=${p.questionCount}/${p.questionCap}` +
        ` ${ms}ms${np?.degraded ? "  [DEGRADED]" : ""}`,
    );
    if (next) console.log(`      ${next.text}`);

    done = Boolean(turn.json.done);
    turnSeq++;
  }

  // ---- 7. the coverage promise ------------------------------------------
  heading("7. Coverage promise — fix 1");
  const last = rows.at(-1);
  const bankLed = rows.filter((r) => r.source === "bank").length;
  const resumeLed = rows.filter((r) => r.source === "resume").length;
  const turnsPerItem = last && last.total > 0 ? rows.length / last.total : Infinity;

  check("interview finished on its own", done, `${rows.length} turns`);
  if (MODE === "full") {
    check("every resume item was covered",
      Boolean(last && last.covered === last.total),
      `${last?.covered}/${last?.total}`);
  }
  check("stayed within the cap",
    Boolean(last && last.q <= last.cap), `${last?.q}/${last?.cap}`);
  check("asked both generic and resume-led questions",
    bankLed > 0 && resumeLed > 0, `${bankLed} bank / ${resumeLed} resume`);
  check("adapted the move to the answer",
    new Set(rows.map((r) => r.move)).size > 1,
    [...new Set(rows.map((r) => r.move))].join(", "));

  const latencies = rows.map((r) => r.ms).sort((a, b) => a - b);
  console.log(
    `\n  turns/item: ${turnsPerItem.toFixed(2)}` +
      `   latency p50 ${latencies[Math.floor(latencies.length / 2)]}ms` +
      `  max ${latencies.at(-1)}ms` +
      `   degraded turns: ${rows.filter((r) => r.degraded).length}`,
  );

  // ---- 8. report --------------------------------------------------------
  heading("8. POST /api/sessions/:id/report");
  await sleep(PACE_MS);
  const report = await call("POST", `/api/sessions/${sessionId}/report`);
  check("report generated", report.status === 200, `HTTP ${report.status}`);
  if (report.status === 200) {
    console.log(`\n  summary: ${String(report.json.summary ?? "").slice(0, 200)}`);
    console.log(`  overall: ${JSON.stringify(report.json.overallScores)}`);
    console.log(`  stats:   ${JSON.stringify(report.json.stats)}`);
  } else {
    console.log(`  ${report.text.slice(0, 300)}`);
  }

  heading("Result");
  console.log(
    failures === 0
      ? "Live run matched the design on every check."
      : `${failures} check(s) failed.`,
  );
  console.log(
    "\nTest data is left in place — run `npm run cleanup:test` to remove it,\n" +
      "which also exercises the explicit FK-order delete path.",
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
