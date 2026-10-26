/**
 * Book sizing, matching page-flip's "stretch" arithmetic, so content laid out
 * at a fixed page size can be scaled to the page actually on screen.
 */

export type BookOrientation = "landscape" | "portrait";

/** The logical size a page's content is laid out at, px. */
export interface PageSize {
  width: number;
  height: number;
}

/** Where a book is open. */
export interface BookState {
  /** First page of the spread on screen. */
  page: number;
  /** Pages on screen. */
  spread: number[];
  total: number;
  orientation: BookOrientation;
}

export interface BookFitInput {
  /** Width available for the book, px. */
  availableWidth: number;
  /** Height available for the pages, px. */
  availableHeight: number;
  /** The logical page size content is laid out at. */
  page: PageSize;
  /** Below this page width a spread no longer fits: one page at a time. */
  minPageWidth: number;
  maxPageWidth: number;
}

export interface BookFit {
  orientation: BookOrientation;
  /** Width of the block the engine lays the book out in. */
  blockWidth: number;
  pageWidth: number;
  pageHeight: number;
  /** pageWidth / page.width: how much the laid-out content is scaled. */
  scale: number;
}

export function fitBook({ availableWidth, availableHeight, page, minPageWidth, maxPageWidth }: BookFitInput): BookFit {
  const ratio = page.width / page.height;
  const byHeight = Math.max(0, availableHeight) * ratio;
  const spreadPage = Math.floor(Math.min(availableWidth / 2, byHeight, maxPageWidth));
  if (spreadPage >= minPageWidth) return fit("landscape", spreadPage, spreadPage * 2, page, ratio);
  // The engine goes portrait below 2 × minPageWidth; a single page always is.
  const single = Math.max(1, Math.floor(Math.min(availableWidth, byHeight, maxPageWidth, minPageWidth * 2 - 1)));
  return fit("portrait", single, single, page, ratio);
}

function fit(orientation: BookOrientation, pageWidth: number, blockWidth: number, page: BookFitInput["page"], ratio: number): BookFit {
  return { orientation, blockWidth, pageWidth, pageHeight: pageWidth / ratio, scale: pageWidth / page.width };
}

/**
 * The pages on screen for a current page index (the engine reports a spread's
 * first page). With covers, the first and last pages show alone.
 */
export function spreadAt(page: number, total: number, orientation: BookOrientation, covers: boolean): number[] {
  if (total <= 0) return [];
  const p = Math.min(Math.max(0, page), total - 1);
  if (orientation === "portrait") return [p];
  if (covers && (p === 0 || p === total - 1)) return [p];
  return p + 1 < total ? [p, p + 1] : [p];
}

/**
 * Whether a page lands on the left of its spread in landscape. Covers shift
 * every spread by one: [0], [1, 2], [3, 4]…; without them [0, 1], [2, 3]…
 */
export function isLeftPage(index: number, covers: boolean): boolean {
  return covers ? index % 2 === 1 : index % 2 === 0;
}

/** A box placed in its parent, turned about its centre. */
export interface TurnedBox {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Degrees, clockwise. */
  rotate: number;
}

/**
 * The clipboard's sheets are laid out sideways and turned upright, so the
 * engine's one-page turn lifts a sheet over the top edge. The engine's block
 * is the page turned a quarter right, and each page's content is turned back
 * inside it; both turn about the page's centre, or the sheet lands askew.
 */
export function clipboardFrame(page: PageSize): { block: TurnedBox; content: TurnedBox } {
  const dx = (page.width - page.height) / 2;
  const dy = (page.height - page.width) / 2;
  return {
    block: { left: dx, top: dy, width: page.height, height: page.width, rotate: 90 },
    content: { left: -dx, top: -dy, width: page.width, height: page.height, rotate: -90 },
  };
}

/**
 * How deep the stacks of pages either side of the spread on screen are, in
 * px up to `max`: what has been read lies on the left, what is left to read
 * on the right. A stack of even one page shows.
 */
export function stackDepths({ spread, total }: Pick<BookState, "spread" | "total">, max: number): { left: number; right: number } {
  const last = total - 1;
  if (last < 1 || spread.length === 0) return { left: 0, right: 0 };
  const depth = (pages: number) => (pages > 0 ? Math.max(1, Math.round((max * pages) / last)) : 0);
  return { left: depth(spread[0]), right: depth(last - spread[spread.length - 1]) };
}
