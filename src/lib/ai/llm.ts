/**
 * Gemini adapter. The ONLY file that knows which LLM provider we use — keep it
 * that way, so switching providers stays a one-file change.
 *
 * TODO(slice 2): implement with `@google/genai` (see README > Dependencies).
 * Ref: docs/TechDesign-JobMe-MVP.md > External Services and Dependencies
 *
 * Server-only. GEMINI_API_KEY must never reach the browser.
 *
 * Two facts that overrule docs/TechDesign-JobMe-MVP.md (verified 2026-09-26):
 *
 *  1. `gemini-2.5-flash` is NOT available to this project. Google restricted
 *     2.5 access on 2026-09-18 to projects with prior usage. New projects get
 *     the 3.x line.
 *  2. Thinking CANNOT be disabled on Gemini 3. The parameter is
 *     `thinking_level`, there is no `off`, and `minimal` is the floor. We pick
 *     a model whose DEFAULT is already `minimal` rather than fighting it, since
 *     the 1.5s turn budget has no room for reasoning tokens.
 *
 * We deliberately use the legacy `generateContent` surface rather than the
 * newer Interactions API: its camelCase config is unambiguous, whereas the
 * Interactions docs disagree with themselves about snake_case vs camelCase for
 * `thinking_level` in JS. A silently-ignored key there leaves thinking at the
 * default and destroys the latency budget with no error. Switchable via
 * LLM_SURFACE once scripts/latency-probe.ts has settled the casing question.
 */

import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

/** Lazily constructed so importing this module never requires a key. */
export function genai(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new LlmError(
        "GEMINI_API_KEY is not set. Copy .env.example to .env.local.",
      );
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export class LlmError extends Error {
  constructor(
    message: string,
    /** True when the call failed because of the free tier's 15 RPM ceiling. */
    public readonly rateLimited = false,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export interface GenerateJsonResult<T> {
  value: T;
  /** Should be ~0 on the chosen model. Non-zero means the config regressed. */
  thoughtTokens: number;
  outputTokens: number;
  ms: number;
}

/**
 * One structured-output call.
 *
 * NOTE: no `thinkingConfig` is sent. On `gemini-3.5-flash-lite` the default
 * already reports zero thought tokens and is the fastest of the three modes —
 * `thinkingBudget: 0` is rejected outright and `MINIMAL` costs ~126ms for
 * identical output. See the measurement table below. If you change
 * `LLM_MODEL`, re-run `npm run probe`: the accepted modes differ per model.
 */
export async function generateJson<T>(args: {
  systemInstruction: string;
  prompt: string;
  /** Provider JSON schema. Keep it FLAT — $ref/oneOf/allOf are unsupported. */
  responseSchema: unknown;
  temperature?: number;
  model?: string;
  /** Aborts the call so a slow turn degrades instead of hanging. */
  signal?: AbortSignal;
}): Promise<GenerateJsonResult<T>> {
  const started = performance.now();
  try {
    const res = await genai().models.generateContent({
      model: args.model ?? LLM_MODEL,
      contents: args.prompt,
      config: {
        systemInstruction: args.systemInstruction,
        responseMimeType: "application/json",
        responseSchema: args.responseSchema as never,
        temperature: args.temperature ?? 0.2,
        abortSignal: args.signal,
      },
    });

    const text = res.text ?? "";
    let value: T;
    try {
      value = JSON.parse(text) as T;
    } catch {
      throw new LlmError(
        `Model returned unparseable JSON: ${text.slice(0, 200)}`,
      );
    }

    return {
      value,
      thoughtTokens: res.usageMetadata?.thoughtsTokenCount ?? 0,
      outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
      ms: performance.now() - started,
    };
  } catch (err) {
    if (err instanceof LlmError) throw err;
    const message = (err as Error).message ?? String(err);
    const rateLimited = /RESOURCE_EXHAUSTED|429/.test(message);
    throw new LlmError(
      rateLimited
        ? `Rate limited (free tier is ${FREE_TIER_RPM} requests/minute).`
        : message.slice(0, 300),
      rateLimited,
    );
  }
}

/**
 * MEASURED 2026-09-26 by scripts/latency-probe.ts, not assumed:
 *
 *   model                  mode      thoughts   latency
 *   gemini-3.5-flash-lite  default          0     964ms   <- chosen
 *   gemini-3.5-flash-lite  budget 0   REJECTED (400)
 *   gemini-3.5-flash-lite  MINIMAL          0    1090ms
 *   gemini-3.1-flash-lite  default          0    7785ms
 *   gemini-3.8-flash       default        651    5637ms
 *   gemini-3.8-flash       budget 0         0    3476ms
 *   gemini-3.8-flash       MINIMAL    REJECTED ("not supported for this model")
 *
 * Two things that are per-model and not guessable from the docs: flash-lite
 * REJECTS `thinkingBudget: 0` while 3.8-flash accepts it, and 3.8-flash REJECTS
 * `MINIMAL` while flash-lite accepts it.
 *
 * So: send NO thinkingConfig at all on flash-lite. It already reports zero
 * thought tokens and is the fastest of the three modes. Adding `MINIMAL`
 * costs ~126ms for identical output.
 */
export const LLM_MODEL = process.env.LLM_MODEL ?? "gemini-3.5-flash-lite";

/**
 * Free tier is **15 requests per minute, per model** (measured; the quotaId is
 * GenerateRequestsPerMinutePerProjectPerModel-FreeTier). It is a burst limit,
 * not a daily cap.
 *
 * Fine for the product — one call per turn, ~10 turns over ~8 minutes — but it
 * means back-to-back scripted runs and rehearsal loops WILL hit 429. The
 * degraded-turn path is what keeps an interview alive when they do.
 */
export const FREE_TIER_RPM = 15;

/**
 * `gemini-embedding-001` and NOT `gemini-embedding-2`, deliberately: the newer
 * model AGGREGATES multiple inputs into a single vector unless each is wrapped
 * as its own Content object, and it dropped `taskType`. Both are wrong for
 * chunked retrieval. Max 2048 input tokens per item here.
 */
export const EMBED_MODEL = process.env.EMBED_MODEL ?? "gemini-embedding-001";

/** Embedding width. Configurable on this model via `outputDimensionality`. */
export const EMBED_DIMS = 768;

/** `generateContent` (default) | `interactions` — see the note above. */
export const LLM_SURFACE = process.env.LLM_SURFACE ?? "generateContent";
