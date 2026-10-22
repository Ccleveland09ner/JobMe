/**
 * Builds the coverage list: every role and project (so full mode can ask about
 * each), ranked by match against the job applied for.
 */

import { cosine, embedMany } from "@/lib/ai/embeddings";
import type { RoleProfile } from "@/lib/jd/distill";
import { roleProfileToQuery } from "@/lib/jd/distill";

import type { Chunk } from "./chunk";
import type { ResumeItem } from "@/lib/engine/types";
import type { ResumeFacts } from "./store";

/** Fact to chunks: cheap containment, case-insensitive. */
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

/** Items with their chunk indices; one without a matching chunk is kept, not dropped. */
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
      // Resume order until ranked — most resumes are reverse-chronological.
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

/** Weights for the relevance score (sum to 1). Semantic leads; lexical catches exact tech names. */
export const RANK_WEIGHTS = {
  semantic: 0.55,
  lexical: 0.25,
  kind: 0.1,
  recency: 0.1,
} as const;

/** Blend of the item's own vector and its best chunk (one strong bullet still counts). */
const ITEM_VECTOR_WEIGHT = 0.6;
const BEST_CHUNK_WEIGHT = 0.4;

/** Employment history is what an interviewer probes first; projects flex. */
const KIND_SCORE: Record<ResumeItem["kind"], number> = {
  role: 1,
  project: 0.75,
};

const STOPWORDS = new Set([
  "and", "the", "for", "with", "you", "our", "will", "are", "have", "from",
  "that", "this", "your", "work", "working", "team", "teams", "experience",
  "ability", "strong", "some", "exposure", "nice", "required", "plus",
]);

/** Lowercased alphanumeric tokens of 3+ characters, stopwords removed. */
export function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9+#.]+/)) {
    const t = raw.replace(/^[.+#]+|[.+#]+$/g, "");
    if (t.length >= 3 && !STOPWORDS.has(t)) out.add(t);
  }
  return out;
}

/** Share of what the posting asks for that this item evidences (containment, not Jaccard). */
export function lexicalOverlap(roleTokens: Set<string>, itemText: string): number {
  if (roleTokens.size === 0) return 0;
  const itemTokens = tokenize(itemText);
  let hits = 0;
  for (const t of roleTokens) if (itemTokens.has(t)) hits++;
  return hits / roleTokens.size;
}

/** Resume order as a 1..0 ramp within each kind (roles and projects are separate lists). */
function recencyByKind(items: ResumeItem[]): number[] {
  const seen: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const i of items) counts[i.kind] = (counts[i.kind] ?? 0) + 1;

  return items.map((i) => {
    const rank = seen[i.kind] ?? 0;
    seen[i.kind] = rank + 1;
    const total = counts[i.kind];
    return total <= 1 ? 1 : 1 - rank / (total - 1);
  });
}

/** Cosine mapped from -1..1 onto 0..1, so weights stay comparable. */
function normalised(cos: number): number {
  return Math.max(0, Math.min(1, (cos + 1) / 2));
}

/** The text that represents an item to the embedder. */
export function itemDocument(item: ResumeItem, chunks: Chunk[]): string {
  const backing = chunks
    .filter((c) => item.chunkSeqs.includes(c.index))
    .map((c) => c.content)
    .join(" ");
  return [item.label, item.employer ?? "", backing]
    .filter(Boolean)
    .join(". ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sorts most relevant to the target role first: each item embedded on its own,
 * blended with its best chunk and lexical, kind and recency signals; ties break
 * deterministically. Falls back to metadata-only ordering.
 */
export async function rankItemsAgainstRole(
  items: ResumeItem[],
  chunks: Chunk[],
  profile: RoleProfile | null,
): Promise<ResumeItem[]> {
  if (items.length === 0) return items;

  const docs = items.map((item) => itemDocument(item, chunks));

  // No posting to rank against: metadata alone still gives a stable order.
  if (!profile) return finalise(items, docs.map(() => null));

  try {
    const query = roleProfileToQuery(profile);
    const roleTokens = tokenize(
      [
        profile.title,
        ...profile.requiredSkills,
        ...profile.responsibilities,
        ...profile.competencies,
      ].join(" "),
    );

    // One batched call: the role query, every item document, every chunk.
    const vectors = await embedMany(
      [query, ...docs, ...chunks.map((c) => c.content)],
      "RETRIEVAL_QUERY",
    );
    const roleVector = vectors[0];
    const itemVectors = vectors.slice(1, 1 + docs.length);
    const chunkVectors = vectors.slice(1 + docs.length);

    const parts = items.map((item, i) => {
      const itemCos = itemVectors[i]
        ? normalised(cosine(roleVector, itemVectors[i]))
        : 0;

      const chunkCosines = item.chunkSeqs
        .map((seq) => chunks.findIndex((c) => c.index === seq))
        .filter((idx) => idx >= 0 && chunkVectors[idx])
        .map((idx) => normalised(cosine(roleVector, chunkVectors[idx])));

      const bestChunk = chunkCosines.length ? Math.max(...chunkCosines) : itemCos;

      return {
        semantic: ITEM_VECTOR_WEIGHT * itemCos + BEST_CHUNK_WEIGHT * bestChunk,
        lexical: lexicalOverlap(roleTokens, docs[i]),
      };
    });

    return finalise(items, parts);
  } catch (err) {
    console.warn(
      `[items] ranking failed, falling back to metadata order: ${
        (err as Error).message
      }`,
    );
    return finalise(items, docs.map(() => null));
  }
}

/** Applies the weights and the deterministic tie-break. */
function finalise(
  items: ResumeItem[],
  parts: ({ semantic: number; lexical: number } | null)[],
): ResumeItem[] {
  const recencies = recencyByKind(items);

  const scored = items.map((item, i) => {
    const part = parts[i];
    const kind = KIND_SCORE[item.kind];
    const recency = recencies[i];

    // Without a semantic signal, renormalise metadata to span the full range.
    const relevance = part
      ? RANK_WEIGHTS.semantic * part.semantic +
        RANK_WEIGHTS.lexical * part.lexical +
        RANK_WEIGHTS.kind * kind +
        RANK_WEIGHTS.recency * recency
      : (RANK_WEIGHTS.kind * kind + RANK_WEIGHTS.recency * recency) /
        (RANK_WEIGHTS.kind + RANK_WEIGHTS.recency);

    return { item, relevance, order: i };
  });

  scored.sort(
    (a, b) =>
      b.relevance - a.relevance ||
      KIND_SCORE[b.item.kind] - KIND_SCORE[a.item.kind] ||
      a.order - b.order ||
      a.item.id.localeCompare(b.item.id),
  );

  return scored.map(({ item, relevance }) => ({
    ...item,
    // Rounded, so float noise can't reorder items; the tie-break decides.
    relevanceToRole: Math.round(relevance * 1e6) / 1e6,
  }));
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
