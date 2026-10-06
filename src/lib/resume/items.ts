/**
 * Builds the coverage list the interview works through. Two jobs: enumerate
 * every role and project so full mode can guarantee each gets a question, and
 * order them by match against the job applied for, so an interview that runs
 * out of budget still covered what mattered most.
 *
 * Ref: EngineState.resumeItems
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

/**
 * Backed by chunk indices, so a question about an item can retrieve the
 * underlying text. Items with no matching chunk are kept, not dropped — the
 * candidate listed the role, so it still gets asked about; it just falls back
 * to resume order for ranking.
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

/**
 * Weights for the blended relevance score. Sum to 1, so a score is 0..1 and
 * comparable across resumes.
 *
 * Semantic carries the most because it is the only signal that understands
 * "built a REST API" and "backend service development" are the same thing.
 * Lexical is the counterweight: embeddings blur exact technology names, and a
 * posting asking for PostgreSQL should rank the item that says PostgreSQL.
 */
export const RANK_WEIGHTS = {
  semantic: 0.55,
  lexical: 0.25,
  kind: 0.1,
  recency: 0.1,
} as const;

/**
 * How the two semantic vectors are blended.
 *
 * The item vector is the whole experience, which is what discriminates
 * between items; the best chunk keeps the property that one strongly matching
 * bullet makes an item worth asking about, instead of being averaged away.
 */
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

/**
 * Share of what the posting asks for that this item evidences.
 *
 * Containment rather than Jaccard: a long item should not be penalised for
 * mentioning things the posting never asked about.
 */
export function lexicalOverlap(roleTokens: Set<string>, itemText: string): number {
  if (roleTokens.size === 0) return 0;
  const itemTokens = tokenize(itemText);
  let hits = 0;
  for (const t of roleTokens) if (itemTokens.has(t)) hits++;
  return hits / roleTokens.size;
}

/**
 * Resume order as a 1..0 ramp, computed WITHIN each kind.
 *
 * A resume lists roles newest-first and projects newest-first as two separate
 * sequences, so a single global index conflates them: the first project would
 * outscore the second role on recency even though they are not comparable.
 * Ranking within the kind keeps recency a tie-break among peers and leaves
 * the role-versus-project call to KIND_SCORE, where it belongs.
 */
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
 * Sorts most relevant to the target role first.
 *
 * Previously this took the maximum cosine across an item's chunks, which
 * produced IDENTICAL scores for every item sharing a chunk — observed live as
 * 0.618, 0.618, 0.597, 0.597, 0.597, 0.597, making "most relevant first"
 * effectively arbitrary. A resume routinely has more items than chunks, so
 * that collision is the normal case, not an edge case.
 *
 * Now each item is embedded as its own document, blended with its best chunk,
 * and combined with a lexical, a kind and a recency signal. Ties break
 * deterministically, so the same resume always produces the same order.
 *
 * Falls back to metadata-only ordering if embedding fails, and to the same if
 * there is no job description — still deterministic, never unordered.
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

    // Without a semantic signal the two content weights have nothing to score,
    // so metadata is renormalised to span the full range rather than capping
    // every item at 0.2 and flattening the thing we just fixed.
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
    // Rounded so a float that differs in the 15th decimal cannot reorder two
    // items between runs; the tie-break then decides, which is reproducible.
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
