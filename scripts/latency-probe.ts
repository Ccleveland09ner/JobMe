/**
 * HOUR 1. Run this before building anything else: `npm run probe`
 *
 * Answers the project's one genuine unknown — can a full turn fit in 2.5s on
 * free tiers? — and settles the model questions the docs cannot.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > Latency Plan
 *
 * Gates:
 *   eval p50 <= 1100ms, p90 <= 1800ms
 *   TTS first byte <= 600ms
 *
 * Findings already established from the installed SDK's own types, so this
 * script no longer has to discover them:
 *   - There is NO `interactions` namespace in @google/genai v2.24.x, so the
 *     legacy `generateContent` surface is the only option, and the snake_case
 *     vs camelCase ambiguity in Google's Interactions docs is moot here.
 *   - Thinking config is `config.thinkingConfig`, camelCase, with
 *     `thinkingBudget?: number` ("0 is DISABLED") and `thinkingLevel?:
 *     ThinkingLevel` (MINIMAL | LOW | MEDIUM | HIGH — there is no OFF).
 *   - Thought tokens come back as `usageMetadata.thoughtsTokenCount`.
 *
 * What remains genuinely unknown, and is what this script measures:
 *   1. Which model IDs actually resolve for THIS project (2.5 is restricted).
 *   2. Whether `thinkingBudget: 0` is accepted per model, since the SDK says
 *      allowed ranges are model dependent. If it is, it beats MINIMAL.
 *   3. Real p50/p90 with the real schema and a realistic answer.
 *   4. The free-tier request ceiling, which is no longer published anywhere.
 *   5. TTS first-byte latency at two bitrates.
 */

import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { loadEnv, percentiles, requireEnv } from "./_env";

loadEnv();

const ai = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });

/** Candidates in preference order. 2.5-flash is deliberately absent. */
const CANDIDATE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
];

const EVAL_P50_GATE_MS = 1100;
const EVAL_P90_GATE_MS = 1800;
const TTS_TTFB_GATE_MS = 600;

/**
 * The real turn schema. Flat on purpose: the supported JSON Schema subset
 * excludes $ref/oneOf/allOf and deeply nested schemas may be rejected outright.
 *
 * `evidence` and `primary_gap` are deliberately absent — both are computed in
 * code (see src/lib/engine/classify.ts), so paying decode tokens for them was
 * waste. Decode dominates this call, so the payload size IS the latency.
 */
const SCORE = { type: Type.INTEGER, minimum: 1, maximum: 4 } as const;

const EVAL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    scores: {
      type: Type.OBJECT,
      properties: {
        structure: SCORE,
        specificity: SCORE,
        impact: SCORE,
        ownership: SCORE,
        relevance: SCORE,
      },
      required: ["structure", "specificity", "impact", "ownership", "relevance"],
    },
    observation: { type: Type.STRING },
    off_topic: { type: Type.BOOLEAN },
    drafts: {
      type: Type.OBJECT,
      properties: {
        deepen: { type: Type.STRING },
        clarify: { type: Type.STRING },
      },
      required: ["deepen", "clarify"],
    },
  },
  required: ["scores", "observation", "off_topic", "drafts"],
} as const;

const SYSTEM = [
  "You are a recruiter scoring one behavioral interview answer.",
  "Score 1-4 on structure, specificity, impact, ownership, relevance.",
  "observation: one terse line, max 90 chars, on what you noticed.",
  "drafts.deepen and drafts.clarify: one follow-up question each, max 25 words,",
  "referencing the candidate's own words. Invent no facts about the candidate.",
].join(" ");

const QUESTION = "Tell me about a time you worked on a team to ship something.";

/** A realistic mid-quality answer, ~150 words — the shape we actually score. */
const ANSWER = [
  "So last semester I was on a team of four building a course scheduling tool",
  "for a class project. We had about six weeks. I picked up the backend, mostly",
  "the API that handled conflict detection between course times, which turned",
  "out to be trickier than we thought because of cross-listed sections. We hit a",
  "problem where the scheduler was timing out on larger inputs, and the team",
  "spent a while trying to figure out why. Eventually we found it was doing a",
  "full comparison on every pair of sections, so it was quadratic. I rewrote it",
  "to bucket sections by day first, which cut it down a lot. We shipped on time",
  "and the professor used it as a demo for the next cohort. Looking back I think",
  "I should have profiled it earlier instead of guessing, that cost us a few",
  "days we did not really have.",
].join(" ");

function heading(title: string): void {
  console.log("\n" + "=".repeat(68) + "\n" + title + "\n" + "=".repeat(68));
}

/**
 * MEASURED 2026-09-26: the free tier allows 15 requests per MINUTE per model
 * (quotaId GenerateRequestsPerMinutePerProjectPerModel-FreeTier) — a burst
 * limit, not the ~20/day some reports claimed.
 *
 * That is comfortably enough for the product: one call per turn, ~10 turns
 * spread over an 8-minute interview. It is NOT enough for an unpaced probe,
 * which is why calls below are spaced.
 */
const FREE_TIER_RPM = 15;
const PACE_MS = Math.ceil(60_000 / FREE_TIER_RPM) + 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Gemini errors arrive as a wall of JSON; keep the useful part. */
function briefError(err: unknown): string {
  const raw = (err as Error).message ?? String(err);
  try {
    const parsed = JSON.parse(raw);
    const e = parsed.error ?? parsed;
    const retry = /retryDelay":"(\d+)s/.exec(raw)?.[1];
    return (
      `${e.code ?? "?"} ${e.status ?? ""} ${String(e.message ?? "").slice(0, 120)}` +
      (retry ? ` (retry in ${retry}s)` : "")
    );
  } catch {
    return raw.slice(0, 160);
  }
}

function isRateLimit(err: unknown): boolean {
  return /RESOURCE_EXHAUSTED|429/.test((err as Error).message ?? "");
}

let failures = 0;
function gate(label: string, actual: number, limit: number): void {
  const ok = actual <= limit;
  if (!ok) failures++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}: ${Math.round(actual)}ms (gate ${limit}ms)`,
  );
}

type ThinkMode = "default" | "budget0" | "minimal";

function thinkingConfigFor(mode: ThinkMode) {
  if (mode === "budget0") return { thinkingConfig: { thinkingBudget: 0 } };
  if (mode === "minimal")
    return { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } };
  return {};
}

async function evalCall(model: string, mode: ThinkMode) {
  const started = performance.now();
  const res = await ai.models.generateContent({
    model,
    contents: `QUESTION: ${QUESTION}\n\nANSWER:\n${ANSWER}`,
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: "application/json",
      responseSchema: EVAL_SCHEMA,
      temperature: 0.2,
      ...thinkingConfigFor(mode),
    },
  });
  const ms = performance.now() - started;
  const u = res.usageMetadata;
  return {
    ms,
    text: res.text ?? "",
    thoughts: u?.thoughtsTokenCount ?? 0,
    output: u?.candidatesTokenCount ?? 0,
    prompt: u?.promptTokenCount ?? 0,
  };
}

/** 1. Which model IDs actually resolve for this project. */
async function probeAvailability(): Promise<string[]> {
  heading("1. Model availability");
  const available: string[] = [];
  try {
    const names: string[] = [];
    for await (const m of await ai.models.list()) {
      if (m.name) names.push(m.name.replace(/^models\//, ""));
    }
    console.log(`  ${names.length} models visible to this key.`);
    for (const id of CANDIDATE_MODELS) {
      const ok = names.includes(id);
      console.log(`  ${ok ? "yes" : "NO "}  ${id}`);
      if (ok) available.push(id);
    }
    const flash25 = names.filter((n) => n.startsWith("gemini-2.5-flash"));
    console.log(
      flash25.length
        ? `  note: 2.5 IS visible here (${flash25.join(", ")}) — prior usage.`
        : "  note: 2.5 not visible, as expected for a new project.",
    );
    const embed = names.filter((n) => n.includes("embedding"));
    console.log(`  embedding models: ${embed.join(", ") || "none visible"}`);
  } catch (err) {
    console.log(`  could not list models: ${(err as Error).message}`);
    console.log("  falling back to trying each candidate directly.");
    return CANDIDATE_MODELS;
  }
  return available.length ? available : CANDIDATE_MODELS;
}

/**
 * 2. How cheaply can thinking be suppressed on each model?
 *
 * The SDK says `thinkingBudget: 0` is DISABLED but that allowed ranges are
 * model dependent, so this is per-model empirical. A model that accepts 0 is
 * strictly better than one that floors at MINIMAL.
 */
async function probeThinking(models: string[]): Promise<void> {
  heading("2. Thinking suppression (thoughtsTokenCount per mode)");
  for (const model of models) {
    console.log(`\n  ${model}`);
    for (const mode of ["default", "budget0", "minimal"] as ThinkMode[]) {
      await sleep(PACE_MS);
      try {
        const r = await evalCall(model, mode);
        console.log(
          `    ${mode.padEnd(8)} thoughts=${String(r.thoughts).padStart(5)}` +
            `  output=${String(r.output).padStart(4)}  ${Math.round(r.ms)}ms`,
        );
      } catch (err) {
        console.log(`    ${mode.padEnd(8)} REJECTED: ${briefError(err)}`);
      }
    }
  }
  console.log(
    "\n  Pick the cheapest mode that is ACCEPTED and reports ~0 thoughts.",
  );
}

/**
 * 3. Latency with the real schema. Sequential — parallel hides queueing — and
 * PACED, because the free tier's 15 RPM otherwise turns the tail of the run
 * into 429s and poisons the percentiles with failures rather than latency.
 */
async function probeLatency(model: string, mode: ThinkMode, n = 12): Promise<void> {
  heading(`3. Eval latency — ${model} (${mode}), N=${n} sequential, paced`);
  const times: number[] = [];
  let parsed = 0;
  let thoughts = 0;
  let output = 0;
  let limited = 0;

  for (let i = 0; i < n; i++) {
    if (i > 0) await sleep(PACE_MS);
    try {
      const r = await evalCall(model, mode);
      times.push(r.ms);
      thoughts += r.thoughts;
      output += r.output;
      try {
        const j = JSON.parse(r.text);
        const s = j.scores ?? {};
        const valid = ["structure", "specificity", "impact", "ownership", "relevance"]
          .every((k) => Number.isInteger(s[k]) && s[k] >= 1 && s[k] <= 4);
        if (valid && j.drafts?.deepen && j.drafts?.clarify) parsed++;
        else console.log(`  run ${i}: parsed but failed validation`);
      } catch {
        console.log(`  run ${i}: UNPARSEABLE — ${r.text.slice(0, 120)}`);
      }
      process.stdout.write(".");
    } catch (err) {
      if (isRateLimit(err)) {
        limited++;
        process.stdout.write("!");
      } else {
        console.log(`\n  run ${i} failed: ${briefError(err)}`);
      }
    }
  }
  console.log("");
  if (limited) console.log(`  ${limited} run(s) rate limited — pacing too tight.`);

  if (!times.length) {
    console.log("  no successful calls");
    failures++;
    return;
  }
  const p = percentiles(times);
  console.log(
    `  mean tokens: output=${Math.round(output / times.length)}` +
      ` thoughts=${Math.round(thoughts / times.length)}`,
  );
  console.log(`  schema validity: ${parsed}/${times.length}`);
  if (parsed !== times.length) failures++;
  gate("eval p50", p.p50, EVAL_P50_GATE_MS);
  gate("eval p90", p.p90, EVAL_P90_GATE_MS);
  console.log(`  max: ${Math.round(p.max)}ms`);
}

/** 4. Embedding latency and the aggregation-trap check. */
async function probeEmbeddings(): Promise<void> {
  heading("4. Embeddings");
  const model = process.env.EMBED_MODEL ?? "gemini-embedding-001";
  const chunks = [
    "Backend engineer, built a scheduling API with conflict detection.",
    "Rewrote a quadratic comparison into day-bucketed lookup.",
    "Led a team of four on a six-week university project.",
  ];
  const times: number[] = [];
  try {
    for (let i = 0; i < 5; i++) {
      const started = performance.now();
      const res = await ai.models.embedContent({
        model,
        contents: chunks,
        config: { taskType: "RETRIEVAL_DOCUMENT", outputDimensionality: 768 },
      });
      times.push(performance.now() - started);

      if (i === 0) {
        const n = res.embeddings?.length ?? 0;
        // THE aggregation-trap detector: gemini-embedding-2 returns ONE vector
        // for many inputs. If n !== chunks.length the model is wrong for RAG.
        console.log(
          `  ${n === chunks.length ? "PASS" : "FAIL"}  one vector per input:` +
            ` ${n} vectors for ${chunks.length} inputs`,
        );
        if (n !== chunks.length) failures++;
        const dims = res.embeddings?.[0]?.values?.length ?? 0;
        console.log(`  ${dims === 768 ? "PASS" : "FAIL"}  dimensions: ${dims}`);
        if (dims !== 768) failures++;
      }
      process.stdout.write(".");
    }
    console.log("");
    const p = percentiles(times);
    console.log(`  batch-of-3 p50: ${Math.round(p.p50)}ms  p90: ${Math.round(p.p90)}ms`);
  } catch (err) {
    console.log(`  FAIL  ${(err as Error).message}`);
    failures++;
  }
}

/** 5. TTS first byte at two bitrates. Lower bitrate reaches Safari's
 *  1024-byte playback threshold sooner. */
async function probeTts(): Promise<void> {
  heading("5. TTS first byte");
  const key = process.env.ELEVENLABS_API_KEY;
  const voice = process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voice) {
    console.log("  skipped: ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID not set.");
    console.log("  (browser speechSynthesis is the dev default — not a failure)");
    return;
  }

  for (const fmt of ["mp3_22050_32", "mp3_44100_128"]) {
    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      const started = performance.now();
      try {
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream` +
            `?output_format=${fmt}`,
          {
            method: "POST",
            headers: { "xi-api-key": key, "content-type": "application/json" },
            body: JSON.stringify({
              text: QUESTION,
              model_id: "eleven_flash_v2_5",
            }),
          },
        );
        if (!res.ok || !res.body) {
          console.log(`  ${fmt} run ${i}: HTTP ${res.status}`);
          continue;
        }
        // First byte, not full download — that is what the listener waits for.
        const reader = res.body.getReader();
        await reader.read();
        times.push(performance.now() - started);
        await reader.cancel();
      } catch (err) {
        console.log(`  ${fmt} run ${i} failed: ${(err as Error).message}`);
      }
    }
    if (times.length) {
      const p = percentiles(times);
      gate(`${fmt} first byte p50`, p.p50, TTS_TTFB_GATE_MS);
      console.log(`         p90: ${Math.round(p.p90)}ms`);
    }
  }
}

/**
 * 6. Free-tier request ceiling. Limits are no longer published, so the only
 * way to know is to hit the wall. Run this ONCE, on day one — if the ceiling
 * is tens of requests per day, one rehearsal exhausts it and the project's
 * shape has to change.
 */
async function probeQuota(model: string): Promise<void> {
  heading("6. Quota ceiling (opt-in)");
  if (process.env.PROBE_QUOTA !== "1") {
    console.log("  skipped. Set PROBE_QUOTA=1 to run — it deliberately");
    console.log("  burns requests until it is rate limited.");
    return;
  }
  let n = 0;
  for (;;) {
    try {
      await ai.models.generateContent({
        model,
        contents: "ok",
        config: { maxOutputTokens: 1, thinkingConfig: { thinkingBudget: 0 } },
      });
      n++;
      if (n % 10 === 0) process.stdout.write(`${n} `);
      if (n >= 400) {
        console.log(`\n  stopped at ${n} without a 429.`);
        return;
      }
    } catch (err) {
      const msg = (err as Error).message;
      console.log(`\n  rate limited after ${n} requests.`);
      console.log(`  ${msg.slice(0, 300)}`);
      return;
    }
  }
}

async function main(): Promise<void> {
  console.log("JobMe latency + model probe");
  console.log(`node ${process.version}`);

  const available = await probeAvailability();
  await probeThinking(available);

  const model = process.env.LLM_MODEL ?? available[0];
  /**
   * MEASURED: on gemini-3.5-flash-lite, sending NO thinking config already
   * yields thoughtsTokenCount = 0 and is the fastest of the three modes —
   * `thinkingBudget: 0` is rejected outright (400) and `MINIMAL` is slower for
   * identical output. The inverse holds on gemini-3.8-flash, which rejects
   * MINIMAL but accepts budget 0. Per-model, and not guessable from the docs.
   */
  const mode: ThinkMode = (process.env.PROBE_THINK_MODE as ThinkMode) ?? "default";

  await probeLatency(model, mode);
  await probeEmbeddings();
  await probeTts();
  await probeQuota(model);

  heading("Result");
  if (failures === 0) {
    console.log("  All gates passed. Proceed as designed.");
  } else {
    console.log(`  ${failures} gate(s) failed.`);
    console.log("  Fallbacks in order: filler clip -> trim the prompt and the");
    console.log("  few-shot examples -> pre-synthesize the 4 topic openings ->");
    console.log("  template clarify instead of drafting it -> lighter model.");
  }
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
