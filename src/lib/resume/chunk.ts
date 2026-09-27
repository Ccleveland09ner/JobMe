/**
 * Splits redacted resume text into embeddable chunks.
 *
 * Pure and estimate-based: `countTokens` is accurate but costs a network call
 * per chunk against a 15 RPM free tier, so 30 chunks would spend two minutes
 * of quota just measuring. A pessimistic chars-per-token ratio is used here
 * and verified once, in the test, against the real tokenizer.
 *
 * Chunks follow resume structure rather than a fixed window — retrieval
 * quality depends on a chunk being about one thing. The 2048-token model limit
 * is hard, so an oversized chunk is an API error, not a quality problem.
 *
 * Ref: TechDesign > Embedding Checks
 */

/**
 * Pessimistic on purpose: English averages ~4 chars/token and resumes skew
 * lower, so a low ratio over-estimates tokens and fails safe.
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
 * A short standalone line, all-caps or a known section word. Shortness stops a
 * bullet beginning "Skills" being read as a heading.
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
    // Pathological: emit alone so the token assertion catches it rather than
    // silently truncating.
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
      // Prefix the section: "Reduced p99 by 40%" means more under EXPERIENCE.
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
