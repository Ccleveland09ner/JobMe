/**
 * Semantic retrieval over a user's own resume chunks.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > Embedding Checks
 *
 * NOT on the per-answer critical path, on purpose. Retrieving with the
 * answer's vector would force embed -> prompt -> LLM in series and destroy the
 * `Promise.all([evaluateAndDraft, embed])` parallelism the 1.5s turn budget
 * depends on. The turn prompt carries the distilled `resume_facts` instead.
 *
 * This is used where a round trip is affordable: choosing an opening at
 * session start, picking the next topic, and P1 question de-duplication.
 */

import { createClient } from "@/lib/supabase/server";

import { embed } from "@/lib/ai/embeddings";

export interface RetrievedChunk {
  id: string;
  seq: number;
  section: string | null;
  content: string;
  similarity: number;
}

/**
 * Ranks a user's resume chunks against a query.
 *
 * Goes through the `match_resume_chunks` RPC because PostgREST cannot express
 * `order by embedding <=> $1`. That function is `security invoker`, so RLS
 * still applies inside it and a caller can only ever match their own chunks —
 * the `resume_id` filter is defence in depth, not the security boundary.
 */
export async function retrieveRelevantChunks(
  resumeId: string,
  query: string,
  topK = 4,
): Promise<RetrievedChunk[]> {
  const queryVector = await embed(query, "RETRIEVAL_QUERY");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_resume_chunks", {
    p_resume_id: resumeId,
    // pgvector parses its own literal syntax, and `[0.1,0.2,...]` is exactly
    // what JSON.stringify of a number[] produces. Passing text rather than a
    // vector-typed parameter is what lets the function resolve the `vector`
    // type at call time — see the migration for why that matters.
    p_query: JSON.stringify(queryVector),
    p_match_count: topK,
  });

  if (error) {
    // Retrieval is an enhancement: a failure here must never take down an
    // interview. Degrade to no resume context rather than throwing.
    console.warn(`[retrieve] match_resume_chunks failed: ${error.message}`);
    return [];
  }

  return (data ?? []) as RetrievedChunk[];
}

/**
 * Formats retrieved chunks for a prompt. Wrapped by the caller in
 * `asUntrustedData()` — resume text is attacker-controlled as far as the
 * prompt is concerned, since anyone can upload anything.
 */
export function formatChunksForPrompt(chunks: RetrievedChunk[]): string {
  if (!chunks.length) return "";
  return chunks
    .map((c, i) => `[${i + 1}] ${c.content.replace(/\s+/g, " ").trim()}`)
    .join("\n");
}
