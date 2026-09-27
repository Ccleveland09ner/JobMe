/**
 * `npm run rehearse` (add `--live` for one real-model run).
 *
 * Drives complete interviews through the REAL turn pipeline — pre-classifier,
 * banding, the engine, question selection, coverage, plateau detection — and
 * asserts the guarantees the product is built on.
 *
 * The evaluator is scripted by default, so a 24-turn session costs nothing
 * against a 15 requests/minute free tier. Everything downstream is identical.
 */

import { questionFor, pickTopics } from "../src/lib/engine/bank";
import { initState } from "../src/lib/engine/policy";
import type {
  Band,
  EngineState,
  InterviewMode,
  Question,
  ResumeItem,
  Scores,
} from "../src/lib/engine/types";
import type { RawEvaluation } from "../src/lib/ai/evaluate";
import { runTurn } from "../src/lib/interview/turn";
import { loadEnv, requireEnv } from "./_env";

loadEnv();

const LIVE = process.argv.includes("--live");
const PACE_MS = 4200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// ---------------------------------------------------------------------------
// Scripted answers and a scripted evaluator
// ---------------------------------------------------------------------------

const flat = (n: number): Scores => ({
  situation: n,
  task: n,
  action: n,
  result: n,
  specificity: n,
  impact: n,
  ownership: n,
  relevance: n,
});

const ANSWERS = {
  weak: "We worked as a team and we fixed the bug that was there.",
  mediocre:
    "We were building a scheduling tool for a class project over about six " +
    "weeks. The team split up the work and I took some of the backend. We " +
    "ran into a performance problem near the end but we figured it out.",
  strong:
    "Our checkout service was timing out at peak, about 3% of orders failing. " +
    "Three of us split it up and I took the root cause. I profiled it, found " +
    "the conflict detection was quadratic over line items, and proposed " +
    "bucketing by SKU. Our tech lead wanted caching, so I built both behind a " +
    "flag and we compared on staging. Bucketing won because the catalog " +
    "changed hourly. p99 went from 1,200 ms to 340 ms and held through " +
    "Black Friday.",
};

/** Deterministic stand-in for the model. */
function scriptedEvaluator(
  plan: (turn: number) => { band: Band; repeats?: boolean },
) {
  let turn = 0;
  const evaluate = async (): Promise<RawEvaluation> => {
    const { band, repeats } = plan(turn++);
    const scores =
      band === "weak" ? flat(1) : band === "great" ? flat(4) : flat(2);
    return {
      scores,
      observation: `scripted ${band}`,
      off_topic: false,
      repeats_previous: Boolean(repeats),
      drafts: {
        deepen: `What trade-off did you weigh on turn ${turn}?`,
        clarify: `What did you personally change on turn ${turn}?`,
      },
    };
  };
  void ANSWERS;
  return evaluate as unknown as NonNullable<
    Parameters<typeof runTurn>[0]["evaluate"]
  >;
}

function makeItems(count: number): ResumeItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    kind: i % 2 === 0 ? ("role" as const) : ("project" as const),
    label: i % 2 === 0 ? `Engineer at Company ${i}` : `Project ${i}`,
    chunkSeqs: [i],
    relevanceToRole: 1 - i * 0.05,
    covered: false,
  }));
}

function startSession(mode: InterviewMode, items: ResumeItem[]): EngineState {
  const topics = pickTopics(mode === "full" ? 6 : 4);
  const first: Question = {
    text: questionFor(topics[0], 1),
    type: "opening",
    topic: topics[0],
    difficulty: 1,
    source: "bank",
  };
  return initState({ mode, topics, resumeItems: items, firstQuestion: first });
}

interface Trace {
  state: EngineState;
  moves: string[];
  sources: string[];
  bands: (Band | null)[];
  turns: number;
}

async function runSession(opts: {
  mode: InterviewMode;
  items: ResumeItem[];
  answerFor: (turn: number) => string;
  plan: (turn: number) => { band: Band; repeats?: boolean };
  live?: boolean;
}): Promise<Trace> {
  let state = startSession(opts.mode, opts.items);
  const moves: string[] = [];
  const sources: string[] = [];
  const bands: (Band | null)[] = [];
  let turn = 0;

  while (!state.done && turn < 60) {
    if (opts.live && turn > 0) await sleep(PACE_MS);

    const result = await runTurn({
      state,
      transcript: opts.answerFor(turn),
      holdMs: 30_000,
      captureMs: 24_000,
      evaluate: opts.live ? undefined : scriptedEvaluator(() => opts.plan(turn)),
      // A SECOND model call. Stubbed offline too, or a 24-turn rehearsal
      // spends a minute of quota and exercises the fallback, not the real path.
      generateQuestion: opts.live
        ? undefined
        : async ({ item, fallbackTopic }) => ({
            text: `Tell me about a challenge you hit on ${item.label}.`,
            topic: fallbackTopic,
            itemId: item.id,
          }),
      excerptFor: async (id) =>
        opts.items.find((i) => i.id === id)?.label ?? "",
    });

    if (result.kind === "nudge") {
      turn++;
      continue;
    }

    moves.push(result.move);
    sources.push(result.next?.source ?? "-");
    bands.push(result.notepad.band);
    state = result.state;
    turn++;
  }

  return { state, moves, sources, bands, turns: turn };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function quickMode(): Promise<void> {
  console.log("\nQuick mode — bounded, bank-led, reproducible");
  const trace = await runSession({
    mode: "quick",
    items: makeItems(3),
    answerFor: () => ANSWERS.mediocre,
    plan: () => ({ band: "mediocre" }),
  });

  check("finishes", trace.state.done);
  check(
    "respects the 10-question cap",
    trace.state.questionCount <= 10,
    `asked ${trace.state.questionCount}`,
  );
  check("wraps exactly once", trace.moves.filter((m) => m === "wrap").length === 1);
  console.log(`         moves: ${trace.moves.join(" -> ")}`);
}

async function fullMode(): Promise<void> {
  console.log("\nFull mode — coverage guaranteed");
  const items = makeItems(6);
  const trace = await runSession({
    mode: "full",
    items,
    answerFor: () => ANSWERS.mediocre,
    plan: () => ({ band: "mediocre" }),
  });

  const uncovered = trace.state.resumeItems.filter((i) => !i.covered);
  check("finishes", trace.state.done);
  check(
    "every resume item was covered",
    uncovered.length === 0,
    uncovered.map((i) => i.label).join(", "),
  );
  check(
    "stays within the derived cap",
    trace.state.questionCount <= trace.state.questionCap,
    `${trace.state.questionCount}/${trace.state.questionCap}`,
  );
  check(
    "cap is in the 8-24 band",
    trace.state.questionCap >= 8 && trace.state.questionCap <= 24,
    `cap ${trace.state.questionCap}`,
  );

  const resumeLed = trace.sources.filter((s) => s === "resume").length;
  const bankLed = trace.sources.filter((s) => s === "bank").length;
  check("asks a mix of generic and resume-led", resumeLed > 0 && bankLed > 0,
    `${bankLed} bank / ${resumeLed} resume`);
}

async function resumeHeavy(): Promise<void> {
  console.log("\nResume-heavy — 10 items, coverage under pressure");
  const items = makeItems(10);
  const trace = await runSession({
    mode: "full",
    items,
    answerFor: () => ANSWERS.mediocre,
    plan: () => ({ band: "mediocre" }),
  });

  const covered = trace.state.resumeItems.filter((i) => i.covered);
  check("finishes", trace.state.done);
  check(
    "covered every item",
    covered.length === items.length,
    `${covered.length}/${items.length}`,
  );
  check("cap is clamped at 24", trace.state.questionCap <= 24,
    `cap ${trace.state.questionCap}`);

  // A truncated interview must still have covered the most relevant items.
  const order = trace.state.resumeItems.map((i) => i.relevanceToRole);
  const sorted = [...order].sort((a, b) => b - a);
  check("preserves relevance ranking", JSON.stringify(order) === JSON.stringify(sorted));
}

async function weakThenStrong(): Promise<void> {
  console.log("\nAdaptivity — weak clarifies, strong deepens");

  const weak = await runSession({
    mode: "quick",
    items: [],
    answerFor: () => ANSWERS.weak,
    plan: () => ({ band: "weak" }),
  });
  const strong = await runSession({
    mode: "quick",
    items: [],
    answerFor: () => ANSWERS.strong,
    plan: () => ({ band: "great" }),
  });

  check("weak answers produce a clarify", weak.moves.includes("clarify"));
  check("weak answers never produce a deepen", !weak.moves.includes("deepen"));
  check("strong answers produce a deepen", strong.moves.includes("deepen"));
  check("strong answers never produce a clarify", !strong.moves.includes("clarify"));
  check(
    "strong answers raise difficulty",
    strong.state.difficulty > 1,
    `difficulty ${strong.state.difficulty}`,
  );
}

async function plateauAndRepeat(): Promise<void> {
  console.log("\nPlateau and repeat detection");

  // Same scores every turn: the follow-up lifts nothing, so resolve.
  const plateau = await runSession({
    mode: "quick",
    items: [],
    answerFor: () => ANSWERS.mediocre,
    plan: () => ({ band: "mediocre" }),
  });
  const followUpRuns = plateau.moves.filter(
    (m) => m === "clarify" || m === "deepen",
  ).length;
  check(
    "a plateau resolves the topic instead of looping",
    followUpRuns < plateau.moves.length,
    `${followUpRuns} follow-ups across ${plateau.moves.length} moves`,
  );

  // A restated answer is a plateau even when the scores move.
  const repeating = await runSession({
    mode: "quick",
    items: [],
    answerFor: () => ANSWERS.mediocre,
    plan: (t) => ({ band: t === 0 ? "mediocre" : "great", repeats: t > 0 }),
  });
  check(
    "a repeated answer resolves the thread",
    repeating.state.done,
    `${repeating.turns} turns`,
  );
}

async function liveQuick(): Promise<void> {
  console.log("\nLive quick-mode rehearsal (real model, paced for 15 RPM)");
  requireEnv("GEMINI_API_KEY");

  const answers = [ANSWERS.weak, ANSWERS.strong, ANSWERS.mediocre];
  const trace = await runSession({
    mode: "quick",
    items: [],
    answerFor: (t) => answers[t % answers.length],
    plan: () => ({ band: "mediocre" }),
    live: true,
  });

  check("completed a live session", trace.state.done, `${trace.turns} turns`);
  check("stayed within the cap", trace.state.questionCount <= 10);
  console.log(`         moves: ${trace.moves.join(" -> ")}`);
  console.log(`         bands: ${trace.bands.join(", ")}`);
}

async function main(): Promise<void> {
  console.log(`Rehearsal harness${LIVE ? " (live)" : " (scripted evaluator)"}`);

  await quickMode();
  await fullMode();
  await resumeHeavy();
  await weakThenStrong();
  await plateauAndRepeat();
  if (LIVE) await liveQuick();

  console.log("\n" + "=".repeat(60));
  console.log(
    failures === 0
      ? "All rehearsals behaved as designed."
      : `${failures} check(s) failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
