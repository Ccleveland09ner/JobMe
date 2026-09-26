/**
 * Gemini adapter. The ONLY file that knows which LLM provider we use — keep it
 * that way, so switching providers stays a one-file change.
 *
 * TODO(slice 2): implement with `@google/genai` (see README > Dependencies).
 * Ref: docs/TechDesign-JobMe-MVP.md > External Services and Dependencies
 *
 * Server-only. GEMINI_API_KEY must never reach the browser.
 *
 * Verify in hour 1 (Open Question #2): the current fast-model ID and the
 * config key that disables "thinking" — latency depends on it.
 */

/** Generate JSON matching a provider-side response schema. */
export async function generateJson<T>(args: {
  systemInstruction: string;
  prompt: string;
  /** Provider JSON schema, passed as `responseSchema`. */
  responseSchema: unknown;
  temperature?: number;
}): Promise<T> {
  void args;
  throw new Error("TODO(slice 2): generateJson not implemented");
}

/** Embed one or more strings. Returns one vector per input. */
export async function embed(texts: string[]): Promise<number[][]> {
  void texts;
  throw new Error("TODO(slice 2): embed not implemented");
}

export const LLM_MODEL = process.env.LLM_MODEL ?? "gemini-2.5-flash";
export const EMBED_MODEL = process.env.EMBED_MODEL ?? "gemini-embedding-001";
