/**
 * Fitting a document's blocks onto fixed-height pages. Pure: the heights are
 * measured by the caller (components/ui/usePaginatedPages.tsx).
 */

export interface FlowBlock {
  id: string;
  /** Measured height, px. */
  height: number;
  /** Start a new page before this block. */
  breakBefore?: boolean;
  /** Start on a left-hand page; blank pages fill the gap. */
  startOnLeft?: boolean;
  /** Keep on the same page as the block after it (a heading with its first entry). */
  keepWithNext?: boolean;
}

export type PagePlan = { kind: "blocks"; ids: string[] } | { kind: "blank" };

export interface PackOptions {
  /** Height a page has for blocks. */
  capacity: number;
  /** Space between blocks on a page. */
  gap: number;
  /** The document page index the first packed page lands on. */
  firstPage?: number;
  /** Whether a document page index is a left-hand page. */
  isLeft?: (pageIndex: number) => boolean;
}

export function packPages(blocks: FlowBlock[], { capacity, gap, firstPage = 0, isLeft = () => true }: PackOptions): PagePlan[] {
  const pages: PagePlan[] = [];
  let ids: string[] = [];
  let used = 0;
  const close = () => {
    if (!ids.length) return;
    pages.push({ kind: "blocks", ids });
    ids = [];
    used = 0;
  };

  blocks.forEach((block, i) => {
    if (block.breakBefore || block.startOnLeft) close();
    if (block.startOnLeft) {
      while (!isLeft(firstPage + pages.length)) pages.push({ kind: "blank" });
    }
    const next = blocks[i + 1];
    const tail = block.keepWithNext && next && !next.breakBefore && !next.startOnLeft ? gap + next.height : 0;
    if (ids.length && used + gap + block.height + tail > capacity) close();
    used += (ids.length ? gap : 0) + block.height;
    ids.push(block.id);
  });
  close();
  return pages;
}

/**
 * Splits text into pieces of at most `maxChars`, at sentence ends where it
 * can and between words where it must, so a long answer can run on.
 */
export function splitText(text: string, maxChars: number): string[] {
  const sentences = text.match(/[^.!?]+(?:[.!?]+["')\]]*)?\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const sentence of sentences) {
    if (current && (current + sentence).trim().length > maxChars) push();
    if (sentence.trim().length <= maxChars) {
      current += sentence;
      continue;
    }
    for (const word of sentence.split(/(\s+)/)) {
      if (current.trim() && (current + word).trim().length > maxChars) push();
      current += word;
    }
  }
  push();
  return chunks;
}
