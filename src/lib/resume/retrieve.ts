/**
 * Semantic retrieval over a user's own resume chunks. Not on the per-answer
 * path (it would serialise the turn); used at session start and for de-duplication.
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

/** Via the match_resume_chunks RPC (PostgREST can't order by distance); RLS applies inside it. */
export async function retrieveRelevantChunks(
  resumeId: string,
  query: string,
  topK = 4,
): Promise<RetrievedChunk[]> {
  const queryVector = await embed(query, "RETRIEVAL_QUERY");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_resume_chunks", {
    p_resume_id: resumeId,
    // Passed as text: JSON.stringify gives pgvector's literal syntax (see the migration).
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

/** Resume text is untrusted: the caller wraps it in asUntrustedData(). */
export function formatChunksForPrompt(chunks: RetrievedChunk[]): string {
  if (!chunks.length) return "";
  return chunks
    .map((c, i) => `[${i + 1}] ${c.content.replace(/\s+/g, " ").trim()}`)
    .join("\n");
}
