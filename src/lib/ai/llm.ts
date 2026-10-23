/**
 * The Gemini adapter: the only file that knows the provider. Server-only.
 * Uses generateContent (@google/genai 2.24 has no interactions namespace).
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
 * The model's JSON. A failure never quotes the output: it can carry resume or
 * answer text, and error messages end up in server logs.
 */
export function parseModelJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new LlmError(`Model returned unparseable JSON (${text.length} characters)`);
  }
}

/** One structured-output call, with no thinkingConfig. Re-run `npm run probe` if LLM_MODEL changes. */
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

    return {
      value: parseModelJson<T>(res.text ?? ""),
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
 * Measured (npm run probe): flash-lite with no thinkingConfig is fastest (~1 s,
 * 0 thoughts); a thinking budget of 0 is rejected. Accepted modes vary by model.
 */
export const LLM_MODEL = process.env.LLM_MODEL ?? "gemini-3.5-flash-lite";

/** Measured: 15 requests/minute per model; a 429 takes the degraded-turn path. */
export const FREE_TIER_RPM = 15;

/** Not gemini-embedding-2 (merges inputs, drops taskType). Max 2048 tokens per item. */
export const EMBED_MODEL = process.env.EMBED_MODEL ?? "gemini-embedding-001";

/** Embedding width. Configurable on this model via `outputDimensionality`. */
export const EMBED_DIMS = 768;
