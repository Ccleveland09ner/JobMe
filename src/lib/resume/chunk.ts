/**
 * Splits redacted resume text into embeddable chunks.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > Embedding Checks
 *
 * `gemini-embedding-001` accepts a hard maximum of 2048 input tokens per item,
 * so an oversized chunk is an API error rather than a quality problem. We aim
 * well under it.
 *
 * Chunking is PURE and estimate-based on purpose. The accurate way to count is
 * `ai.models.countTokens`, but that is a network call per chunk against a
 * 15 RPM free tier — 30 chunks would exhaust two minutes of quota just to
 * measure. Instead we use a deliberately pessimistic characters-per-token
 * ratio here and verify the assumption once, in the test, against the real
 * tokenizer.
 *
 * Chunks follow resume structure (a role, a project, an education entry)
 * rather than a fixed window, because retrieval quality depends on a chunk
 * being about one thing.
 */

/**
 * Pessimistic on purpose. English averages ~4 chars/token; resumes skew lower
 * because of punctuation, bullets and acronyms. Under-estimating the ratio
 * means over-estimating the token count, which fails safe.
 */
export const CHARS_PER_TOKEN = 3;

/** Target ceiling per chunk. The API's hard limit is 2048. */
export const MAX_CHUNK_TOKENS = 1800;

/** Below this, a chunk is merged into its neighbour rather than embedded alone. */
export const MIN_CHUNK_CHARS = 80;

const MAX_CHUNK_CHARS = MAX_CHUNK_TOKENS * CHARS_PER_TOKEN;

/** Headings that mark a new resume section. */
const SECTION_WORDS = [
  "experience",
  "employment",
  "work history",
  "professional experience",
  "education",
  "skills",
  "technical skills",
  "projects",
  "publications",
  "certifications",
  "awards",
  "summary",
  "profile",
  "objective",
  "volunteering",
  "interests",
  "languages",
];

export interface Chunk {
  index: number;
  /** The section this chunk came from, when one was detected. */
  section: string | null;
  content: string;
  estimatedTokens: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * A heading is a short standalone line that is either all-caps or matches a
 * known section word. Requiring shortness avoids treating a bullet that
 * happens to start with "Skills" as a heading.
 */
export function isSectionHeading(line: string): boolean {
  const t = line.trim().replace(/[:\s]+$/, "");
  if (!t || t.length > 40) return false;
  if (/^[-•*]/.test(t)) return false;
  const lower = t.toLowerCase();
  if (SECTION_WORDS.includes(lower)) return true;
  // ALL CAPS standalone line of 1-4 words.
  return /^[A-Z][A-Z\s&/'-]{2,}$/.test(t) && t.split(/\s+/).length <= 4;
}

/**
 * Splits an over-long block on line boundaries, never mid-line.
 *
 * `budget` is the caller's ceiling MINUS whatever prefix will be prepended
 * afterwards. Splitting to the full budget and then adding a section prefix
 * puts the chunk back over the limit — by exactly the prefix length.
 */
function splitOversized(block: string, budget: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const line of block.split(/\r?\n/)) {
    // A single line longer than the budget is pathological; emit it alone and
    // let the caller's token assertion catch it rather than silently truncate.
    if (line.length > budget) {
      if (current.trim()) out.push(current.trim());
      out.push(line.trim());
      current = "";
      continue;
    }
    if ((current + "\n" + line).length > budget) {
      if (current.trim()) out.push(current.trim());
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export function chunkResume(text: string): Chunk[] {
  if (!text.trim()) return [];

  // Walk lines, tracking the current section and accumulating blank-line
  // separated blocks (one role, one project, one entry).
  let section: string | null = null;
  const blocks: { section: string | null; content: string }[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content) blocks.push({ section, content });
    buffer = [];
  };

  for (const line of text.split(/\r?\n/)) {
    if (isSectionHeading(line)) {
      flush();
      section = line.trim().replace(/[:\s]+$/, "");
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();

  // Merge undersized neighbours within the same section, split oversized ones.
  const merged: { section: string | null; content: string }[] = [];
  for (const block of blocks) {
    const last = merged[merged.length - 1];
    const fits =
      last &&
      last.section === block.section &&
      last.content.length < MIN_CHUNK_CHARS &&
      (last.content + "\n\n" + block.content).length <= MAX_CHUNK_CHARS;
    if (fits) {
      last.content = `${last.content}\n\n${block.content}`;
    } else {
      merged.push({ ...block });
    }
  }

  const chunks: Chunk[] = [];
  for (const block of merged) {
    // Reserve room for the section prefix added below, plus its newline.
    const prefixCost = block.section ? block.section.length + 1 : 0;
    const budget = MAX_CHUNK_CHARS - prefixCost;
    const pieces =
      block.content.length > budget
        ? splitOversized(block.content, budget)
        : [block.content];
    for (const piece of pieces) {
      // Prefix the section so an isolated bullet still carries its context
      // into the embedding — "Reduced p99 by 40%" means more under EXPERIENCE.
      const content = block.section ? `${block.section}\n${piece}` : piece;
      chunks.push({
        index: chunks.length,
        section: block.section,
        content,
        estimatedTokens: estimateTokens(content),
      });
    }
  }

  return chunks;
}
