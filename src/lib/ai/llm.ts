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

/** Default: the Flash-Lite tier whose `thinking_level` default is `minimal`. */
export const LLM_MODEL = process.env.LLM_MODEL ?? "gemini-3.5-flash-lite";

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
