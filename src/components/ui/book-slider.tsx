"use client";

/**
 * Fixed-size pages turned like paper, on react-pageflip (book-engine.tsx).
 *
 *   book       a two-page spread between hard covers (the ledger)
 *   folder     a double-sided booklet; page 0 lies on the folder's flap
 *   clipboard  one sheet at a time, turned up over the clip, by its buttons
 *
 * Content is laid out at `pageSize` and scaled to the page on screen. A new
 * document or page count rebuilds the book.
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";

import { clipboardFrame, stackDepths, type BookState, type PageSize, type TurnedBox } from "@/lib/frontend/book-layout";
import { prefersReducedMotion } from "@/lib/frontend/motion";

import { Engine, PagesContext, programmatic, settingsFor, stateOf, type BookMode, type FlipEngine, type FlipEvent } from "./book-engine";
import { useBookFit } from "./useBookFit";
import { usePageArrowKeys } from "./usePageArrowKeys";

export type { BookMode } from "./book-engine";
export type { BookState, PageSize } from "@/lib/frontend/book-layout";

export interface BookSliderHandle {
  next(): void;
  prev(): void;
  /** `focus`: the id of an element on that page to focus once the turn lands. */
  turnTo(page: number, options?: { animate?: boolean; focus?: string }): void;
}

export interface BookSliderProps {
  mode: BookMode;
  /** One node per page, laid out at `pageSize`. */
  pages: ReactNode[];
  pageSize: PageSize;
  /** Identifies the document; a new one (or a new page count) rebuilds the book. */
  documentKey: string;
  /** Accessible name for the book. */
  label: string;
  startPage?: number;
  /** Book and folder: one page at a time below this width, and never wider than the max. */
  minPageWidth?: number;
  maxPageWidth?: number;
  /** Book and folder: viewport height kept free for what surrounds the pages. */
  reserveHeight?: number;
  /** Classes on each page element; fixed for the document's life. */
  pageClassName?: (index: number) => string;
  /** Pages that turn stiffly, like a cover. */
  hardPage?: (index: number) => boolean;
  onPageChange?: (state: BookState) => void;
  onReady?: (state: BookState) => void;
  /** Book and folder: the previous/next bar with the page numbers. */
  controls?: boolean;
  /** Book and folder: ArrowLeft and ArrowRight turn pages. */
  keyboard?: boolean;
  /** Words for where the reader is, for the bar and the live region. */
  describe?: (state: BookState) => string;
  className?: string;
  /** Drawn with the pages and positioned against them, but not part of the book: a close tag, folder tabs. */
  children?: ReactNode;
  /** The book is the panel of tabs among `children`: its region becomes their tabpanel, with this id. */
  tabPanelId?: string;
  ref?: Ref<BookSliderHandle>;
}

function describePages({ spread, total }: BookState): string {
  const [first, second] = spread.map((i) => i + 1);
  return second ? `Pages ${first}–${second} of ${total}` : `Page ${first} of ${total}`;
}

/** Moves focus to an element on the page just turned to (a heading, usually). */
function focusOn(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
  el.focus({ preventScroll: true });
}

/** Between the covers, rather than shut on one of them. */
function isOpen({ spread, total }: BookState): boolean {
  return !spread.includes(0) && !spread.includes(total - 1);
}

/** Which cover a shut book shows. */
function shutOn(state: BookState): "front" | "back" | undefined {
  if (isOpen(state)) return undefined;
  return state.spread.includes(0) ? "front" : "back";
}

const turned = ({ left, top, width, height, rotate }: TurnedBox): CSSProperties => ({
  left,
  top,
  width,
  height,
  transform: `rotate(${rotate}deg)`,
});

/** A book's boards (a folder's card) stand this far out from its pages, each side. */
const FRAME_INSET = 14;
/** The deepest a stack of pages beside the open spread is drawn, px. */
const STACK_DEPTH = { book: 12, folder: 6 } as const;

export function BookSlider({
  mode,
  pages,
  pageSize,
  documentKey,
  label,
  startPage = 0,
  minPageWidth = 300,
  maxPageWidth = 560,
  reserveHeight = 170,
  pageClassName,
  hardPage,
  onPageChange,
  onReady,
  controls = mode !== "clipboard",
  keyboard = mode !== "clipboard",
  describe = describePages,
  className = "",
  children,
  tabPanelId,
  ref,
}: BookSliderProps) {
  const root = useRef<HTMLDivElement>(null);
  const engine = useRef<FlipEngine | null>(null);
  const [reduced] = useState(prefersReducedMotion);
  const [state, setState] = useState<BookState | null>(null);
  const covers = mode === "book";
  const clipboard = mode === "clipboard";
  const fit = useBookFit(root, !clipboard, pageSize, minPageWidth, maxPageWidth, reserveHeight, clipboard ? 0 : FRAME_INSET);

  // The engine binds its handlers once: hand it stable ones that read the latest props.
  const latest = useRef({ onPageChange, onReady, covers });
  useEffect(() => {
    latest.current = { onPageChange, onReady, covers };
  });
  // Where a turn asked for is to put focus when it lands.
  const arrival = useRef<string | null>(null);
  const shown = useRef<BookState | null>(null);
  const report = useCallback((next: BookState) => {
    shown.current = next;
    setState(next);
    latest.current.onPageChange?.(next);
    const id = arrival.current;
    arrival.current = null;
    if (id) focusOn(id);
  }, []);
  const onInit = useCallback(
    (e: FlipEvent) => {
      engine.current = e.object;
      const next = stateOf(e.object, latest.current.covers);
      report(next);
      latest.current.onReady?.(next);
    },
    [report],
  );
  const onFlip = useCallback(
    (e: FlipEvent) => {
      if (engine.current === e.object) report(stateOf(e.object, latest.current.covers));
    },
    [report],
  );
  const onTeardown = useCallback((gone: FlipEngine) => {
    if (engine.current === gone) engine.current = null;
  }, []);

  const next = useCallback(() => {
    const e = engine.current;
    if (!e) return;
    if (reduced) e.turnToNextPage();
    else programmatic(e, () => e.flipNext("top"));
  }, [reduced]);
  const prev = useCallback(() => {
    const e = engine.current;
    if (!e) return;
    if (reduced) e.turnToPrevPage();
    else programmatic(e, () => e.flipPrev("top"));
  }, [reduced]);
  const turnTo = useCallback(
    (page: number, options?: { animate?: boolean; focus?: string }) => {
      const e = engine.current;
      if (!e) return;
      // Already on show: nothing turns, so nothing would land.
      if (shown.current?.spread.includes(page)) {
        if (options?.focus) focusOn(options.focus);
        return;
      }
      arrival.current = options?.focus ?? null;
      if (options?.animate === false || reduced) e.turnToPage(page);
      else programmatic(e, () => e.flip(page, "top"));
    },
    [reduced],
  );
  useImperativeHandle(ref, () => ({ next, prev, turnTo }), [next, prev, turnTo]);
  usePageArrowKeys(keyboard, next, prev);

  // The clipboard's sheets are laid out sideways and turned upright.
  const frame = useMemo(() => (clipboard ? clipboardFrame(pageSize) : null), [clipboard, pageSize]);
  const contentStyle = useMemo<CSSProperties>(
    () =>
      frame
        ? {
            position: "absolute",
            ...turned(frame.content),
            // Its own layer, rasterised upright: drawn into the engine's rotated
            // layer, scaled text loses its letter spacing.
            willChange: "transform",
          }
        : {
            position: "absolute",
            left: 0,
            top: 0,
            width: pageSize.width,
            height: pageSize.height,
            transform: "scale(var(--page-scale, 1))",
            transformOrigin: "0 0",
          },
    [frame, pageSize],
  );
  const pagesContext = useMemo(() => ({ pages, contentStyle }), [pages, contentStyle]);

  const ready = clipboard || fit !== null;
  const engineView = ready && (
    <PagesContext value={pagesContext}>
      <Engine
        key={`${documentKey}:${pages.length}`}
        count={pages.length}
        settings={settingsFor(mode, pageSize, minPageWidth, maxPageWidth, startPage, reduced)}
        pageClassName={pageClassName ?? (() => "book-page")}
        hardPage={hardPage ?? ((i) => covers && (i === 0 || i === pages.length - 1))}
        onInit={onInit}
        onFlip={onFlip}
        onChangeOrientation={onFlip}
        onTeardown={onTeardown}
      />
    </PagesContext>
  );

  const position = state ? describe(state) : "";
  // How deep the page stacks either side of the spread are drawn (globals.css .page-stack).
  const stacks = state && !clipboard ? stackDepths(state, covers ? STACK_DEPTH.book : STACK_DEPTH.folder) : null;
  const atStart = !state || state.page <= 0;
  const atEnd = !state || state.spread[state.spread.length - 1] >= state.total - 1;

  return (
    <div
      ref={root}
      className={`book-slider book-slider--${mode} w-full ${className}`.trim()}
      data-orientation={state?.orientation}
      data-open={covers && state && isOpen(state) ? "" : undefined}
      data-shut={covers && state ? shutOn(state) : undefined}
      style={stacks ? ({ "--stack-left": `${stacks.left}px`, "--stack-right": `${stacks.right}px` } as CSSProperties) : undefined}
    >
      <div
        className="relative mx-auto"
        style={
          clipboard
            ? { width: pageSize.width, height: pageSize.height }
            : ({ width: fit?.blockWidth, "--page-scale": fit?.scale ?? 1 } as CSSProperties)
        }
      >
        {/* The book itself; what is drawn against it (tabs, a tag) sits beside it. */}
        <div
          id={tabPanelId}
          role={tabPanelId ? "tabpanel" : "region"}
          aria-roledescription={mode === "clipboard" ? "form sheets" : "book"}
          aria-label={label}
          className="h-full"
        >
          {!clipboard && <div aria-hidden="true" className={covers ? "book-frame" : "folder-frame"} />}
          {!clipboard && <div aria-hidden="true" className="page-stack" />}
          {frame ? (
            <div className="absolute" style={turned(frame.block)}>
              {engineView}
            </div>
          ) : (
            engineView
          )}
        </div>
        {ready && children}
      </div>

      {controls && state && (
        // Clear of the boards, which stand out below the pages.
        <div className="mt-8 flex items-center justify-center gap-3 pb-1">
          <button type="button" className="book-turn" onClick={prev} disabled={atStart} aria-label="Previous page">
            <span aria-hidden="true">‹</span>
          </button>
          <span aria-hidden="true" className="min-w-36 text-center text-xs tabular-nums text-muted">
            {position}
          </span>
          <button type="button" className="book-turn" onClick={next} disabled={atEnd} aria-label="Next page">
            <span aria-hidden="true">›</span>
          </button>
        </div>
      )}
      <p aria-live="polite" className="sr-only">
        {position}
      </p>
    </div>
  );
}

export default BookSlider;
