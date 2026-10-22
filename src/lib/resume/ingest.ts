/**
 * Ingesting a resume: parse -> redact -> chunk -> embed + distill -> rank ->
 * store. Redaction runs before anything leaves this server. Storage comes in
 * from the route; the upload checks stay there too.
 */

import { embedMany } from "@/lib/ai/embeddings";
import type { ResumeItem } from "@/lib/engine/types";
import { MAX_JD_CHARS, distillJobDescription } from "@/lib/jd/distill";
import type { RoleProfile } from "@/lib/jd/profile";

import { chunkResume } from "./chunk";
import { distillResume } from "./distill";
import { buildResumeItems, rankItemsAgainstRole } from "./items";
import { ResumeParseError, parseResumePdf } from "./parse";
import { redact, type RedactionResult } from "./redact";
import { ResumeStoreError, type StoreResumeArgs, type StoredResume } from "./store";

export type IngestOutcome =
  | {
      kind: "stored";
      stored: StoredResume;
      pageCount: number;
      /** What the interview will work through, in ask order. */
      items: ResumeItem[];
      role: RoleProfile | null;
      redaction: RedactionResult;
      hasFacts: boolean;
    }
  /** Not a PDF we can read; the error says why, for the candidate. */
  | { kind: "unreadable"; error: ResumeParseError }
  | { kind: "empty" }
  /** The embedding or distilling calls failed, usually the free tier's rate limit. */
  | { kind: "ai-unavailable"; reason: string }
  | { kind: "store-failed"; reason: string };

export async function ingestResume(
  bytes: Uint8Array,
  /** A pasted job description, which reorders coverage by relevance; every item is still covered. */
  roleText: string,
  store: (args: StoreResumeArgs) => Promise<StoredResume>,
): Promise<IngestOutcome> {
  let parsed;
  try {
    parsed = await parseResumePdf(bytes);
  } catch (err) {
    if (err instanceof ResumeParseError) return { kind: "unreadable", error: err };
    throw err;
  }

  // Redact, before anything leaves this server.
  const redaction = redact(parsed.text);
  const chunks = chunkResume(redaction.text);
  if (!chunks.length) return { kind: "empty" };

  const jdText = roleText.slice(0, MAX_JD_CHARS);
  let vectors: number[][];
  let facts;
  let role;
  try {
    // Embed and distill, in parallel.
    [vectors, facts, role] = await Promise.all([
      embedMany(
        chunks.map((c) => c.content),
        "RETRIEVAL_DOCUMENT",
      ),
      distillResume(redaction.text),
      jdText ? distillJobDescription(jdText) : Promise.resolve(null),
    ]);
  } catch (err) {
    return { kind: "ai-unavailable", reason: (err as Error).message.slice(0, 200) };
  }

  // Ranked against the role in one batched embedding call: the role, each item and each chunk.
  const items = await rankItemsAgainstRole(buildResumeItems(facts, chunks), chunks, role);

  try {
    const stored = await store({ parsed, redaction, chunks, vectors, facts, role, items });
    return { kind: "stored", stored, pageCount: parsed.pageCount, items, role, redaction, hasFacts: facts !== null };
  } catch (err) {
    if (err instanceof ResumeStoreError) return { kind: "store-failed", reason: err.message };
    throw err;
  }
}
