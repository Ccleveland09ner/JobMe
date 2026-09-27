/**
 * Gemini adapter — the only file that knows which provider we use, so swapping
 * one stays a one-file change. Server-only: GEMINI_API_KEY never reaches the
 * browser.
 *
 * Uses legacy `generateContent`, not Interactions: @google/genai 2.24 exposes
 * no `interactions` namespace at all. Switchable via LLM_SURFACE.
 *
 * Ref: TechDesign > External Services
 */

import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

/** Lazy, so importing this module never requires a key. */
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
    /** Hit the free tier's 15 RPM ceiling. */
    public readonly rateLimited = false,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export interface GenerateJsonResult<T> {
  value: T;
  /** ~0 on the chosen model; non-zero means the config regressed. */
  thoughtTokens: number;
  outputTokens: number;
  ms: number;
}

/**
 * One structured-output call. Sends no `thinkingConfig` — see the table below.
 * Re-run `npm run probe` if you change LLM_MODEL; accepted modes differ.
 */
export async function generateJson<T>(args: {
  systemInstruction: string;
  prompt: string;
  /** Keep FLAT: $ref/oneOf/allOf are unsupported. */
  responseSchema: unknown;
  temperature?: number;
  model?: string;
  /** Aborts so a slow turn degrades rather than hangs. */
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
 * MEASURED by `npm run probe`, not assumed:
 *
 *   gemini-3.5-flash-lite  default      0 thoughts   964ms  <- chosen
 *   gemini-3.5-flash-lite  budget 0     REJECTED (400)
 *   gemini-3.5-flash-lite  MINIMAL      0 thoughts  1090ms
 *   gemini-3.1-flash-lite  default      0 thoughts  7785ms
 *   gemini-3.8-flash       default    651 thoughts  5637ms
 *   gemini-3.8-flash       budget 0     0 thoughts  3476ms
 *   gemini-3.8-flash       MINIMAL      REJECTED
 *
 * Which modes are accepted is per-model and not in the docs. On flash-lite,
 * send no thinkingConfig at all: already zero thoughts, and fastest.
 */
export const LLM_MODEL = process.env.LLM_MODEL ?? "gemini-3.5-flash-lite";

/**
 * Measured: 15 requests/minute per model, a burst limit rather than a daily
 * cap. Fine for one call per turn; rehearsal loops WILL hit 429, which is what
 * the degraded-turn path exists for.
 */
export const FREE_TIER_RPM = 15;

/**
 * NOT `gemini-embedding-2`: it aggregates multiple inputs into one vector and
 * dropped `taskType`, both wrong for chunked retrieval. Max 2048 tokens/item.
 */
export const EMBED_MODEL = process.env.EMBED_MODEL ?? "gemini-embedding-001";

/** Embedding width. Configurable on this model via `outputDimensionality`. */
export const EMBED_DIMS = 768;

/** `generateContent` (default) | `interactions` — see the note above. */
export const LLM_SURFACE = process.env.LLM_SURFACE ?? "generateContent";
