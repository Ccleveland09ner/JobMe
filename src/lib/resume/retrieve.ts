/**
 * Semantic retrieval over a user's own resume chunks.
 *
 * NOT on the per-answer path, deliberately: retrieving with the answer's
 * vector forces embed -> prompt -> LLM in series and costs the turn budget its
 * parallelism. The turn prompt carries distilled `resume_facts` instead.
 *
 * Used where a round trip is affordable: session start, topic selection, and
 * question de-duplication.
 *
 * Ref: TechDesign > Embedding Checks
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
 * Goes through the `match_resume_chunks` RPC because PostgREST cannot express
 * `order by embedding <=> $1`. That function is `security invoker`, so RLS
 * applies inside it — the `resume_id` filter is defence in depth, not the
 * security boundary.
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
    // An enhancement: degrade to no resume context rather than throwing.
    console.warn(`[retrieve] match_resume_chunks failed: ${error.message}`);
    return [];
  }

  return (data ?? []) as RetrievedChunk[];
}

/**
 * The caller wraps this in `asUntrustedData()` — anyone can upload anything,
 * so resume text is attacker-controlled as far as the prompt is concerned.
 */
export function formatChunksForPrompt(chunks: RetrievedChunk[]): string {
  if (!chunks.length) return "";
  return chunks
    .map((c, i) => `[${i + 1}] ${c.content.replace(/\s+/g, " ").trim()}`)
    .join("\n");
}
