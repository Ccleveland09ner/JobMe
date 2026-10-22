/**
 * Embedding calls and vector maths. Do NOT switch to gemini-embedding-2: it
 * merges multiple inputs into one vector and drops taskType, silently.
 */

import type { AnchorSimilarity } from "../engine/classify";
import { EMBED_DIMS, EMBED_MODEL, genai } from "./llm";

/** Conservative: the API's item limit is undocumented, not measured. */
export const EMBED_BATCH_SIZE = 16;

/** Queries and passages embed differently; one task type for both hurts retrieval. */
export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY";

export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

/** One vector per input, in order: asserted, because the failure is silent. */
export async function embedMany(
  texts: string[],
  task: EmbedTask = "RETRIEVAL_DOCUMENT",
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const res = await genai().models.embedContent({
      model: EMBED_MODEL,
      contents: batch,
      config: { taskType: task, outputDimensionality: EMBED_DIMS },
    });

    const vectors = res.embeddings ?? [];
    if (vectors.length !== batch.length) {
      throw new EmbeddingError(
        `Expected ${batch.length} vectors, got ${vectors.length}. ` +
          `Is EMBED_MODEL an aggregating model? Use gemini-embedding-001.`,
      );
    }

    for (const v of vectors) {
      const values = v.values;
      if (!values?.length) throw new EmbeddingError("Empty embedding returned.");
      out.push(values);
    }
  }
  return out;
}

/** Embeds a single text. Convenience over `embedMany`. */
export async function embed(
  text: string,
  task: EmbedTask = "RETRIEVAL_QUERY",
): Promise<number[]> {
  const [vector] = await embedMany([text], task);
  return vector;
}

/** An exact scan: retrieval is scoped to one user's few chunks. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new EmbeddingError(
      `Dimension mismatch: ${a.length} vs ${b.length}. ` +
        `Vectors embedded with different outputDimensionality cannot be compared.`,
    );
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Ranks candidates against a query vector, most similar first. */
export function rankBySimilarity<T>(
  query: number[],
  candidates: { item: T; vector: number[] }[],
  topK = 5,
): { item: T; score: number }[] {
  return candidates
    .map(({ item, vector }) => ({ item, score: cosine(query, vector) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, topK);
}

/**
 * Similarity -> 1-4 relevance.
 * TODO(slice 7): calibrate against the bank exemplars; these thresholds are a guess.
 */
export const SIM_THRESHOLDS = { s2: 0.55, s3: 0.65, s4: 0.75 };

export function simToScore(sim: number): number {
  if (sim < SIM_THRESHOLDS.s2) return 1;
  if (sim < SIM_THRESHOLDS.s3) return 2;
  if (sim < SIM_THRESHOLDS.s4) return 3;
  return 4;
}

export function anchorCheck(
  answerVec: number[],
  topic: string,
): AnchorSimilarity {
  void answerVec;
  void topic;
  throw new Error("TODO(slice 7): anchorCheck not implemented");
}

/** P1: skip a next topic whose opening is cosine > 0.85 to any prior answer. */
export const REPEAT_THRESHOLD = 0.85;
