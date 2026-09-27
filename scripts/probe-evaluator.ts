/**
 * The kernel's live smoke test: `npm run probe:eval`
 *
 * Ref: docs/PRD-JobMe-MVP.md > Success Metrics
 *
 * The demo stands or falls on one thing — the same scripted weak answer and
 * the same scripted strong answer must land in different bands every single
 * run, because that is what produces the visible Clarify-vs-Deepen contrast on
 * stage. Band stability of 2/3 means the demo is a coin flip.
 *
 * Paced for the free tier's 15 requests/minute.
 */

import { evaluateAndDraft, extractEvidence } from "../src/lib/ai/evaluate";
import { checkDraft, preClassify } from "../src/lib/ai/questions";
import { STAR_DIMENSIONS, bandingValues } from "../src/lib/engine/types";
import { loadEnv, requireEnv } from "./_env";

loadEnv();
requireEnv("GEMINI_API_KEY");

const PACE_MS = 4200;
const RUNS = Number(process.env.PROBE_RUNS ?? 2);

const QUESTION = "Tell me about a time you worked on a team to ship something.";

interface Fixture {
  label: string;
  answer: string;
  /** What the design requires of this answer, not merely what it scores. */
  expect: (r: Result) => string | null;
}

interface Result {
  avg: number;
  min: number;
  ownership: number;
  offTopic: boolean;
  star: string;
  band: "weak" | "mediocre" | "great";
}

/**
 * Banding is computed over the STAR ROLL-UP plus the other four dimensions,
 * not over all eight. With eight there are three extra chances to trip the
 * `min >= 3` clause, and Task is the component speakers most often fold into
 * Situation — `great` would become nearly unreachable and the weak-vs-strong
 * contrast this probe exists to protect would collapse.
 */
function band(avg: number, min: number, offTopic: boolean): Result["band"] {
  if (offTopic || avg < 2.0) return "weak";
  if (avg >= 3.5 && min >= 3) return "great";
  return "mediocre";
}

const FIXTURES: Fixture[] = [
  {
    label: "scripted WEAK (the demo's weak take)",
    answer: "We worked as a team and fixed the bug.",
    expect: (r) =>
      r.band === "weak" ? null : `expected weak, got ${r.band}`,
  },
  {
    /**
     * Must be strong AND on-topic. An earlier version of this fixture was a
     * superb answer about a solo performance fix, and the model correctly
     * flagged it off-topic for a TEAMWORK question — which dropped a
     * 3.6-average answer to `weak`. The demo's strong take has the same
     * requirement: it has to actually be about working with a team.
     */
    label: "scripted STRONG (the demo's strong take)",
    answer:
      "Our checkout service was timing out at peak, about 3% of orders " +
      "failing. Three of us split it up: one on monitoring, one on the " +
      "rollback plan, and I took the root cause. I profiled it and found the " +
      "conflict detection compared every pair of line items, so it was " +
      "quadratic. I proposed bucketing by SKU; our tech lead pushed for " +
      "caching instead, so I built both behind a flag and we compared them on " +
      "staging traffic. Bucketing won because the catalog changed hourly and " +
      "a stale cache shipped wrong prices. I paired with the monitoring owner " +
      "to add p99 alerts before we rolled out. p99 went from 1,200 ms to " +
      "340 ms, failed orders under 0.1%, and it held through Black Friday.",
    expect: (r) =>
      r.band === "great" ? null : `expected great, got ${r.band}`,
  },
  {
    label: "MEDIOCRE (story, no numbers, hides behind we)",
    answer:
      "We were building a scheduling tool for a class project and we had " +
      "about six weeks to do it. The team split up the work and I took some " +
      "of the backend. We ran into a performance problem near the end but we " +
      "figured it out together and managed to ship it before the deadline.",
    expect: (r) =>
      r.ownership <= 2 ? null : `expected ownership <= 2, got ${r.ownership}`,
  },
  {
    label: "OFF-TOPIC (answers a different question)",
    answer:
      "I would say my greatest strength is that I am very detail oriented " +
      "and I care a lot about writing clean code. I always make sure my pull " +
      "requests are easy to review and I write thorough documentation for " +
      "everything that I build so the next person can pick it up easily.",
    expect: (r) =>
      r.offTopic || r.band === "weak"
        ? null
        : `expected off-topic or weak, got ${r.band} offTopic=${r.offTopic}`,
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`Evaluator smoke test — ${RUNS} run(s) per fixture\n`);

  let failures = 0;
  let calls = 0;

  for (const fixture of FIXTURES) {
    console.log(`${fixture.label}`);

    // The deterministic pre-classifier gets a vote first, and for the weak
    // fixture it should decide the band outright without any model call.
    const pre = preClassify(fixture.answer);
    if (pre) console.log(`  pre-classifier: forced ${pre} (no model call)`);

    const bands: string[] = [];
    for (let i = 0; i < RUNS; i++) {
      if (calls++ > 0) await sleep(PACE_MS);
      try {
        const evaluation = await evaluateAndDraft({
          topic: "teamwork",
          questionText: QUESTION,
          questionType: "opening",
          answer: fixture.answer,
          difficulty: 1,
        });

        const s = evaluation.scores;
        const values = bandingValues(s);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const min = Math.min(...values);
        const result: Result = {
          avg,
          min,
          ownership: s.ownership,
          offTopic: evaluation.off_topic,
          star: STAR_DIMENSIONS.map((d) => `${d[0].toUpperCase()}${s[d]}`).join(" "),
          band: pre ?? band(avg, min, evaluation.off_topic),
        };
        bands.push(result.band);

        const problem = fixture.expect(result);
        console.log(
          `  run ${i + 1}: ${result.band.padEnd(8)} avg=${avg.toFixed(2)} ` +
            `min=${min} own=${result.ownership}  [${result.star}]` +
            (problem ? `  <-- ${problem}` : ""),
        );
        if (problem) failures++;

        if (i === 0) {
          console.log(`    observation: ${evaluation.observation}`);
          console.log(`    evidence:    "${extractEvidence(fixture.answer)}"`);
          for (const kind of ["clarify", "deepen"] as const) {
            const draft = evaluation.drafts[kind];
            const check = checkDraft(draft);
            console.log(
              `    ${kind}: ${check.ok ? "OK  " : `BAD(${check.reason})`} ${draft}`,
            );
            if (!check.ok) failures++;
          }
        }
      } catch (err) {
        console.log(`  run ${i + 1}: ERROR ${(err as Error).message.slice(0, 120)}`);
        failures++;
      }
    }

    const stable = new Set(bands).size <= 1;
    if (!stable) {
      console.log(`  UNSTABLE across runs: ${bands.join(", ")}`);
      failures++;
    }
    console.log("");
  }

  console.log("=".repeat(60));
  if (failures === 0) {
    console.log("All fixtures behaved as the design requires.");
  } else {
    console.log(`${failures} problem(s). The weak/strong contrast is the`);
    console.log("one that must not fail — it is the demo.");
  }
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
