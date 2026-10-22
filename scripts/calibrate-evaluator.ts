/**
 * `npm run calibrate` — runs the calibration fixtures through the LIVE
 * evaluator and checks that it tells answers of different quality apart.
 *
 * It checks ORDER and RANGES, not whether scores went up: an evasive answer
 * must land low, a confidently wrong technical answer must lose accuracy, and
 * a transcript full of recognition errors must score close to its clean twin.
 * A rubric that passed by inflating everything would fail here.
 *
 * Paced for the free tier (15 requests/minute). Each fixture runs RUNS times
 * (default 2) to catch instability. `--out <file>` saves the raw results.
 *
 * Ref: docs/Scoring-Rubric.md > Calibration; scripts/calibration-fixtures.ts
 */

import { writeFileSync } from "node:fs";

import { evaluateAndDraft, type RawEvaluation } from "../src/lib/ai/evaluate";
import { checkDraft, preClassify } from "../src/lib/ai/questions";
import { BANK } from "../src/lib/engine/bank";
import { classifyBand, resolveGap } from "../src/lib/engine/classify";
import { weightedScore, type TopicId } from "../src/lib/engine/types";
import {
  ANSWERS,
  FOLLOW_UP_CASE,
  ROLES,
  type AnswerFixture,
  type RoleContext,
} from "./calibration-fixtures";
import { loadEnv, requireEnv } from "./_env";

loadEnv();
requireEnv("GEMINI_API_KEY");

const PACE_MS = 4300;
const RUNS = Number(process.env.CALIBRATE_RUNS ?? 2);
const OUT = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let calls = 0;

interface Scored {
  score: number;
  band: string;
  status: string;
  gap: string;
  scores: RawEvaluation["scores"];
  observation: string;
  clarify: string;
  draftsOk: boolean;
}

const roleTextFor = (r: RoleContext) =>
  [`Target role: ${r.title} (${r.seniority})`, r.company ? `Company: ${r.company}` : null]
    .filter(Boolean)
    .join("\n");

async function score(args: {
  fixture: Pick<AnswerFixture, "kind" | "topic" | "question" | "answer"> & { role: RoleContext["id"] };
  questionType?: "opening" | "clarify";
  followUpQuestion?: string;
  prior?: { question: string; answer: string }[];
}): Promise<Scored> {
  if (calls++ > 0) await sleep(PACE_MS);
  const role = ROLES[args.fixture.role];
  const type = args.questionType ?? "opening";
  const e = await evaluateAndDraft({
    kind: args.fixture.kind,
    topic: BANK[args.fixture.topic as TopicId]?.label ?? args.fixture.topic,
    questionText: args.fixture.question,
    questionType: type,
    answer: args.fixture.answer,
    followUpQuestion: args.followUpQuestion ?? null,
    priorThreadTurns: args.prior ?? [],
    roleText: roleTextFor(role),
    seniority: role.seniority,
  });
  const forced = preClassify(args.fixture.answer, type);
  return {
    score: Number((weightedScore(e.scores, args.fixture.kind) ?? 1).toFixed(2)),
    band: forced ?? classifyBand(e.scores, args.fixture.kind, e.off_topic),
    status: e.status,
    gap: resolveGap(e.scores, args.fixture.kind, e.clarify_gap).gap,
    scores: e.scores,
    observation: e.observation,
    clarify: e.drafts.clarify,
    draftsOk: checkDraft(e.drafts.clarify).ok && checkDraft(e.drafts.deepen).ok,
  };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** What a fair interviewer would conclude, per quality level. */
function expectFor(f: AnswerFixture, s: Scored, all: Map<string, Scored[]>): string[] {
  const problems: string[] = [];
  const need = (ok: boolean, msg: string) => ok || problems.push(msg);
  switch (f.level) {
    case "strong":
      need(s.score >= 3.4, `strong answer scored ${s.score} (< 3.4)`);
      break;
    case "good_not_star":
    case "concise_complete":
      need(s.score >= 2.8, `good answer scored ${s.score} (< 2.8)`);
      need(s.band !== "weak", `good answer banded weak`);
      break;
    case "evasive":
      need(s.score < 2.2, `evasive answer scored ${s.score} (>= 2.2)`);
      need((s.scores.relevance ?? 4) <= 2, `evasive answer kept relevance ${s.scores.relevance}`);
      break;
    case "partial":
      need(s.status !== "incorrect", `partial answer marked incorrect`);
      need(s.score < 3.2, `partial answer scored ${s.score} (>= 3.2)`);
      break;
    case "incorrect":
      need((s.scores.accuracy ?? 4) <= 2, `wrong answer kept accuracy ${s.scores.accuracy}`);
      need(s.band === "weak" || s.score < 2.5, `wrong answer scored ${s.score}`);
      break;
    case "strong_technical":
      need(s.score >= 3.3, `strong explanation scored ${s.score} (< 3.3)`);
      need(s.band !== "weak", `strong explanation banded weak`);
      break;
    case "transcription_errors": {
      const twin = all.get(f.cleanTwinOf!);
      if (twin) {
        const gap = Math.abs(s.score - mean(twin.map((t) => t.score)));
        need(gap <= 0.4, `transcript scored ${gap.toFixed(2)} away from its clean twin (> 0.4)`);
      }
      need(s.band !== "weak", `transcript banded weak`);
      break;
    }
  }
  if (!s.draftsOk) problems.push("a draft failed the follow-up gate");
  return problems;
}

async function main() {
  console.log(`Evaluator calibration — ${RUNS} run(s) per fixture\n`);
  const results = new Map<string, Scored[]>();
  let failures = 0;

  for (const f of ANSWERS) {
    const runs: Scored[] = [];
    for (let i = 0; i < RUNS; i++) {
      try {
        runs.push(await score({ fixture: f }));
      } catch (err) {
        console.log(`  ${f.id}: ERROR ${(err as Error).message.slice(0, 120)}`);
        failures++;
      }
    }
    results.set(f.id, runs);
  }

  console.log("fixture                level                score  band      status        gap");
  for (const f of ANSWERS) {
    for (const [i, s] of (results.get(f.id) ?? []).entries()) {
      const problems = expectFor(f, s, results);
      failures += problems.length;
      console.log(
        `${(i ? "" : f.id).padEnd(22)} ${(i ? "" : f.level).padEnd(20)} ${s.score.toFixed(2).padStart(5)}  ` +
          `${s.band.padEnd(9)} ${s.status.padEnd(13)} ${s.gap}` +
          (problems.length ? `  <-- ${problems.join("; ")}` : ""),
      );
    }
    const scores = (results.get(f.id) ?? []).map((s) => s.score);
    if (scores.length > 1 && Math.max(...scores) - Math.min(...scores) > 0.5) {
      console.log(`${"".padEnd(22)} UNSTABLE: ${scores.join(", ")}`);
      failures++;
    }
  }

  // ---- ordering: within each role, better answers score higher --------------
  console.log("\nOrdering");
  const avg = (id: string) => mean((results.get(id) ?? []).map((s) => s.score));
  const orders: [string, string][] = [
    ["swe_strong", "swe_partial"],
    ["swe_good_not_star", "swe_evasive"],
    ["swe_concise", "swe_evasive"],
    ["swe_strong_technical", "swe_incorrect"],
    ["pm_strong", "pm_evasive"],
    ["pm_good_not_star", "pm_evasive"],
    ["pm_strong_problem", "pm_partial"],
  ];
  for (const [better, worse] of orders) {
    const ok = avg(better) > avg(worse) + 0.5;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${better} (${avg(better).toFixed(2)}) > ${worse} (${avg(worse).toFixed(2)}) by > 0.5`);
  }

  // ---- the follow-up case ---------------------------------------------------
  console.log("\nFollow-up adds to the original question");
  const fu = FOLLOW_UP_CASE;
  const base = { kind: fu.kind, topic: fu.topic, question: fu.question, role: fu.role };
  const followUps: { opening: number; cumulative: number; complete: number }[] = [];
  for (let i = 0; i < RUNS; i++) {
    try {
      const opening = await score({ fixture: { ...base, answer: fu.opening } });
      const cumulative = await score({
        fixture: { ...base, answer: fu.followUpAnswer },
        questionType: "clarify",
        followUpQuestion: fu.followUpQuestion,
        prior: [{ question: fu.question, answer: fu.opening }],
      });
      const complete = await score({ fixture: { ...base, answer: fu.complete } });
      followUps.push({ opening: opening.score, cumulative: cumulative.score, complete: complete.score });
      const rose = cumulative.score > opening.score;
      const close = Math.abs(cumulative.score - complete.score) <= 0.5;
      if (!rose || !close) failures++;
      console.log(
        `  run ${i + 1}: opening ${opening.score.toFixed(2)} -> with follow-up ${cumulative.score.toFixed(2)} ` +
          `(complete in one answer: ${complete.score.toFixed(2)})` +
          (rose ? "" : "  <-- did not rise") +
          (close ? "" : "  <-- more than 0.5 from the complete answer"),
      );
    } catch (err) {
      console.log(`  run ${i + 1}: ERROR ${(err as Error).message.slice(0, 120)}`);
      failures++;
    }
  }

  if (OUT) {
    writeFileSync(
      OUT,
      JSON.stringify({ capturedAt: new Date().toISOString(), answers: Object.fromEntries(results), followUps }, null, 2),
    );
    console.log(`\nwrote ${OUT}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(failures === 0 ? "Calibration passed." : `${failures} problem(s).`);
  console.log(`${calls} model call(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
