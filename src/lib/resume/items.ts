/**
 * Turns a distilled resume into the coverage list the interview works through.
 *
 * Ref: EngineState.resumeItems in src/lib/engine/types.ts
 *
 * Two jobs:
 *   1. Enumerate every role and project, so full mode can guarantee each gets
 *      at least one question.
 *   2. Order them by how closely each matches the job being applied for, so a
 *      quick interview — or one that runs out of budget — still covered the
 *      experience that mattered most for that application.
 */

import { cosine, embedMany } from "@/lib/ai/embeddings";
import type { RoleProfile } from "@/lib/jd/distill";
import { roleProfileToQuery } from "@/lib/jd/distill";

import type { Chunk } from "./chunk";
import type { ResumeItem } from "@/lib/engine/types";
import type { ResumeFacts } from "./store";

/** Matching a fact to its chunks: cheap containment, case-insensitive. */
function chunksMentioning(chunks: Chunk[], ...needles: string[]): number[] {
  const terms = needles
    .filter(Boolean)
    .map((n) => n.toLowerCase())
    .filter((n) => n.length >= 3);
  if (!terms.length) return [];
  return chunks
    .filter((c) => {
      const haystack = c.content.toLowerCase();
      return terms.some((t) => haystack.includes(t));
    })
    .map((c) => c.index);
}

function slug(prefix: string, label: string, i: number): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${prefix}-${i}-${base || "item"}`;
}

/**
 * Builds the coverage list from distilled facts, backed by chunk indices so a
 * question about an item can retrieve the underlying resume text.
 *
 * Items with no matching chunk are kept, not dropped: the candidate listed the
 * role, so they should still be asked about it. They just cannot be ranked by
 * content, and fall back to resume order.
 */
export function buildResumeItems(
  facts: ResumeFacts | null,
  chunks: Chunk[],
): ResumeItem[] {
  if (!facts) return [];

  const items: ResumeItem[] = [];

  (facts.roles ?? []).forEach((role, i) => {
    const label = [role.title, role.employer].filter(Boolean).join(" at ");
    if (!label) return;
    items.push({
      id: slug("role", label, i),
      kind: "role",
      label,
      employer: role.employer,
      chunkSeqs: chunksMentioning(chunks, role.employer ?? "", role.title ?? ""),
      // Resume order until ranked: most resumes are reverse-chronological, so
      // this is a sane default when there is no job description to rank by.
      relevanceToRole: 1 - i * 0.01,
      covered: false,
    });
  });

  (facts.projects ?? []).forEach((project, i) => {
    const label = project.trim();
    if (!label) return;
    items.push({
      id: slug("project", label, i),
      kind: "project",
      label,
      chunkSeqs: chunksMentioning(chunks, label.split(/[—–\-:,]/)[0].trim()),
      relevanceToRole: 0.5 - i * 0.01,
      covered: false,
    });
  });

  return items;
}

/**
 * Scores each item against the target role and re-sorts, most relevant first.
 *
 * Uses the MAXIMUM cosine across an item's chunks rather than the mean: one
 * strongly matching bullet makes a role worth asking about, and averaging
 * would let a long role full of routine duties bury its best line.
 *
 * Falls back to the unranked list on any failure — an unranked interview still
 * covers everything, just in resume order.
 */
export async function rankItemsAgainstRole(
  items: ResumeItem[],
  chunks: Chunk[],
  profile: RoleProfile | null,
): Promise<ResumeItem[]> {
  if (!profile || items.length === 0) return items;

  try {
    const query = roleProfileToQuery(profile);
    const chunkTexts = chunks.map((c) => c.content);

    // One batched call: the role query plus every chunk.
    const vectors = await embedMany(
      [query, ...chunkTexts],
      "RETRIEVAL_QUERY",
    );
    const [roleVector, ...chunkVectors] = vectors;

    const scored = items.map((item) => {
      const sims = item.chunkSeqs
        .map((seq) => chunkVectors[seq])
        .filter(Boolean)
        .map((v) => cosine(roleVector, v));

      return {
        ...item,
        // No backing chunk: keep its resume-order score rather than sinking it
        // to zero, which would push a listed role behind every project.
        relevanceToRole: sims.length
          ? Math.max(...sims)
          : item.relevanceToRole * 0.5,
      };
    });

    return scored.sort((a, b) => b.relevanceToRole - a.relevanceToRole);
  } catch (err) {
    console.warn(
      `[items] ranking failed, falling back to resume order: ${
        (err as Error).message
      }`,
    );
    return items;
  }
}

/** Coverage progress, for the progress pill and the wrap condition. */
export function coverageSummary(items: ResumeItem[]): {
  covered: number;
  total: number;
  nextUncovered: ResumeItem | null;
} {
  const covered = items.filter((i) => i.covered).length;
  return {
    covered,
    total: items.length,
    nextUncovered: items.find((i) => !i.covered) ?? null,
  };
}
