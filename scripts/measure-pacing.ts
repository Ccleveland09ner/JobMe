/**
 * Measures how many turns full mode actually spends per resume item.
 *
 * Drives the `fullModeCap` formula from observed engine behaviour rather than
 * an assumed two-questions-per-item. Pure: no network, no database.
 *
 * Usage: npx tsx scripts/measure-pacing.ts
 */

import { pickTopics, questionFor } from "../src/lib/engine/bank";
import {
  commitQuestion,
  initState,
  step,
  uncovered,
} from "../src/lib/engine/policy";
import type {
  Band,
  EngineState,
  Question,
  ResumeItem,
  Scores,
} from "../src/lib/engine/types";
import { computePrimaryGap } from "../src/lib/engine/classify";

const flat = (n: number): Scores => ({
  situation: n, task: n, action: n, result: n,
  specificity: n, impact: n, ownership: n, relevance: n,
});

const SCORES: Record<Band, Scores> = {
  weak: flat(1),
  mediocre: flat(2),
  great: flat(4),
};

/** Band sequences seen in real sessions, plus the pathological extremes. */
const PATTERNS: Record<string, Band[]> = {
  "all-mediocre": ["mediocre"],
  "all-weak": ["weak"],
  "all-great": ["great"],
  "observed-mix": ["great", "weak", "great", "weak", "weak", "mediocre", "weak", "weak", "mediocre"],
  "improving": ["weak", "mediocre", "great"],
};

function items(n: number): ResumeItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `item-${i}`,
    kind: i % 2 === 0 ? ("role" as const) : ("project" as const),
    label: `Item ${i}`,
    chunkSeqs: [i],
    relevanceToRole: 1 - i * 0.05,
    covered: false,
  }));
}

/** Runs one session to completion with an unbounded cap; returns the cost. */
function measure(itemCount: number, bands: Band[]) {
  const topics = pickTopics(6);
  const first: Question = {
    text: questionFor(topics[0], 1),
    type: "opening", topic: topics[0], difficulty: 1, source: "bank",
  };

  let state: EngineState = {
    ...initState({
      mode: "full",
      topics,
      resumeItems: items(itemCount),
      firstQuestion: first,
    }),
    // Unbounded, so we measure what the policy WANTS to spend.
    questionCap: 500,
  };

  let turns = 0;
  const coveredAt: number[] = [];
  let lastCovered = 0;
  let bankTurns = 0;
  let resumeTurns = 0;

  while (!state.done && turns < 400) {
    const band = bands[turns % bands.length];
    const scores = SCORES[band];
    const before = state.currentQuestion.source;

    const r = step(state, { scores, band, primaryGap: computePrimaryGap(scores) });
    turns++;
    if (before === "resume") resumeTurns++; else bankTurns++;

    state = r.state;
    if (r.next) {
      state = commitQuestion(state, {
        text: `q${turns}`, type: r.next.type, topic: r.next.topic,
        difficulty: r.next.difficulty, source: r.next.source,
        resumeItemId: r.next.resumeItem?.id,
      });
    }

    const nowCovered = itemCount - uncovered(state).length;
    while (lastCovered < nowCovered) { coveredAt.push(turns); lastCovered++; }
  }

  return {
    turns,
    covered: lastCovered,
    allCovered: lastCovered === itemCount,
    turnsToFullCoverage: coveredAt[itemCount - 1] ?? Infinity,
    bankTurns,
    resumeTurns,
  };
}

const ITEM_COUNTS = [1, 2, 3, 4, 6, 8, 10, 12];

console.log("Full-mode pacing, cap removed so the policy spends what it wants\n");
console.log("items  pattern         turns  covered  turns/item  bank/resume");
console.log("-".repeat(66));

const perItem: number[] = [];
const worstByCount = new Map<number, number>();

for (const n of ITEM_COUNTS) {
  for (const [name, bands] of Object.entries(PATTERNS)) {
    const r = measure(n, bands);
    const ratio = r.turnsToFullCoverage / n;
    if (Number.isFinite(ratio)) {
      perItem.push(ratio);
      worstByCount.set(n, Math.max(worstByCount.get(n) ?? 0, r.turnsToFullCoverage));
    }
    console.log(
      `${String(n).padStart(5)}  ${name.padEnd(14)} ${String(r.turns).padStart(6)}` +
        `  ${String(r.covered).padStart(7)}  ${ratio.toFixed(2).padStart(10)}` +
        `  ${r.bankTurns}/${r.resumeTurns}`,
    );
  }
}

const mean = perItem.reduce((a, b) => a + b, 0) / perItem.length;
const max = Math.max(...perItem);
console.log("-".repeat(66));
console.log(`\nturns per item — mean ${mean.toFixed(2)}, worst ${max.toFixed(2)}`);
console.log("\nturns needed for FULL coverage, worst case per item count:");
for (const [n, t] of [...worstByCount].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${String(n).padStart(2)} items -> ${t} turns`);
}
