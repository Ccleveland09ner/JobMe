"use client";

/**
 * Fixed-size pages turned like paper, on react-pageflip (StPageFlip).
 *
 *   book       a two-page spread between hard covers (the ledger)
 *   folder     a double-sided booklet; page 0 lies on the folder's flap
 *   clipboard  one sheet at a time, turned up over the clip, by its buttons
 *
 * Content is laid out at `pageSize` and scaled to the page on screen. The
 * engine keeps its own copy of the page elements and moves their DOM, so:
 * page content reaches them through context, a new document or page count
 * rebuilds the book, and the engine is destroyed after React lets go.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import HTMLFlipBook from "react-pageflip";

import { fitBook, spreadAt, type BookFit, type BookOrientation } from "@/lib/frontend/book-layout";
import { isTextEntry } from "@/lib/frontend/dom";
import { prefersReducedMotion } from "@/lib/frontend/motion";

export type BookMode = "book" | "folder" | "clipboard";

export interface PageSize {
  width: number;
  height: number;
}

export interface BookState {
  /** First page of the spread on screen. */
  page: number;
  /** Pages on screen. */
  spread: number[];
  total: number;
  orientation: BookOrientation;
}

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
  /** Drawn with the pages and positioned against them: a close tag, folder tabs. */
  children?: ReactNode;
  ref?: Ref<BookSliderHandle>;
}

/** The page-flip calls we use. */
interface FlipEngine {
  flipNext(corner?: "top" | "bottom"): void;
  flipPrev(corner?: "top" | "bottom"): void;
  flip(page: number, corner?: "top" | "bottom"): void;
  turnToPage(page: number): void;
  turnToNextPage(): void;
  turnToPrevPage(): void;
  getCurrentPageIndex(): number;
  getPageCount(): number;
  getOrientation(): BookOrientation;
  getSettings(): { disableFlipByClick: boolean };
  update(): void;
  destroy(): void;
  getUI(): unknown;
}

/**
 * A turn asked for in code. The engine fakes a click near the book's edge,
 * which in portrait isn't a "corner", so corner-only clicking would swallow
 * it: lift that rule for the call (the check happens straight away).
 */
function programmatic(engine: FlipEngine, turn: () => void) {
  const settings = engine.getSettings();
  const cornersOnly = settings.disableFlipByClick;
  settings.disableFlipByClick = false;
  try {
    turn();
  } finally {
    settings.disableFlipByClick = cornersOnly;
  }
}

interface FlipEvent {
  data: unknown;
  object: FlipEngine;
}

type FlipSettings = Omit<
  ComponentProps<typeof HTMLFlipBook>,
  "className" | "style" | "children" | "ref" | "renderOnlyPageLengthChange" | "onFlip" | "onChangeOrientation" | "onChangeState" | "onInit" | "onUpdate"
>;

/** The engine's destroy() keeps its resize listener when mouse events are off. */
function destroyEngine(engine: FlipEngine) {
  try {
    (engine.getUI() as { removeHandlers?: () => void } | undefined)?.removeHandlers?.();
    engine.destroy();
  } catch {
    // Already gone with its DOM.
  }
}

function stateOf(engine: FlipEngine, covers: boolean): BookState {
  const total = engine.getPageCount();
  const page = engine.getCurrentPageIndex();
  const orientation = engine.getOrientation();
  return { page, spread: spreadAt(page, total, orientation, covers), total, orientation };
}

export function describePages({ spread, total }: BookState): string {
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

/** What a page element renders: its content, from the latest render. */
const PagesContext = createContext<{ pages: ReactNode[]; contentStyle: CSSProperties }>({ pages: [], contentStyle: {} });

function PageShell({ index, className, hard, ref }: { index: number; className: string; hard: boolean; ref?: Ref<HTMLDivElement> }) {
  const { pages, contentStyle } = useContext(PagesContext);
  return (
    <div ref={ref} className={className} data-density={hard ? "hard" : "soft"}>
      <div className="book-page-content" style={contentStyle}>
        {pages[index]}
      </div>
    </div>
  );
}

/**
 * Keeps a mouse press inside from starting a page drag (the engine also
 * cancels the press), so text can be selected and fields focused. A swipe
 * still turns the page on touch screens, where selecting is a long press.
 */
export function FlipSafe({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener("mousedown", stop);
    return () => el.removeEventListener("mousedown", stop);
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

interface EngineProps {
  count: number;
  settings: FlipSettings;
  pageClassName: (index: number) => string;
  hardPage: (index: number) => boolean;
  onInit: (event: FlipEvent) => void;
  onFlip: (event: FlipEvent) => void;
  onChangeOrientation: (event: FlipEvent) => void;
  onTeardown: (engine: FlipEngine) => void;
}

const BLOCK_STYLE: CSSProperties = {};

/** One engine for one document; remounted (keyed) for the next. */
function Engine({ count, settings, pageClassName, hardPage, onInit, onFlip, onChangeOrientation, onTeardown }: EngineProps) {
  const book = useRef<{ pageFlip(): FlipEngine | undefined } | null>(null);

  // The engine exists before it reports in (init is deferred), so ask the
  // book for it while its handle still stands; destroy it once React has
  // removed the DOM, so neither pulls nodes out from under the other.
  useLayoutEffect(() => {
    const handle = book;
    return () => {
      const engine = handle.current?.pageFlip();
      if (!engine) return;
      onTeardown(engine);
      setTimeout(() => destroyEngine(engine), 0);
    };
  }, [onTeardown]);

  return (
    <div className="book-engine">
      <HTMLFlipBook
        ref={book}
        className="book-block"
        style={BLOCK_STYLE}
        {...settings}
        renderOnlyPageLengthChange
        onInit={onInit}
        onFlip={onFlip}
        onChangeOrientation={onChangeOrientation}
      >
        {Array.from({ length: count }, (_, i) => (
          <PageShell key={i} index={i} className={pageClassName(i)} hard={hardPage(i)} />
        ))}
      </HTMLFlipBook>
    </div>
  );
}

function settingsFor(mode: BookMode, size: PageSize, minPageWidth: number, maxPageWidth: number, startPage: number, reduced: boolean): FlipSettings {
  const common = {
    startPage,
    drawShadow: !reduced,
    startZIndex: 0,
    mobileScrollSupport: true,
    clickEventForward: true,
    swipeDistance: 30,
  };
  if (mode === "clipboard") {
    // Laid out sideways and turned upright: the engine's single-page turn
    // then lifts the sheet from the bottom and over the top edge.
    return {
      ...common,
      size: "fixed",
      width: size.height,
      height: size.width,
      minWidth: size.height,
      maxWidth: size.height,
      minHeight: size.width,
      maxHeight: size.width,
      usePortrait: true,
      autoSize: false,
      showCover: false,
      flippingTime: reduced ? 1 : 650,
      maxShadowOpacity: 0.3,
      useMouseEvents: false,
      showPageCorners: false,
      disableFlipByClick: true,
    };
  }
  const ratio = size.width / size.height;
  return {
    ...common,
    size: "stretch",
    width: size.width,
    height: size.height,
    minWidth: minPageWidth,
    maxWidth: maxPageWidth,
    minHeight: Math.round(minPageWidth / ratio),
    maxHeight: Math.round(maxPageWidth / ratio),
    usePortrait: true,
    autoSize: true,
    showCover: mode === "book",
    flippingTime: reduced ? 1 : 750,
    maxShadowOpacity: 0.45,
    useMouseEvents: true,
    showPageCorners: !reduced,
    disableFlipByClick: true,
  };
}

/** A book's boards (a folder's card) stand this far out from its pages, each side. */
const FRAME_INSET = 14;

/** The book's fit to the space it is given, kept up to date with the window. */
function useFit(
  root: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  size: PageSize,
  minPageWidth: number,
  maxPageWidth: number,
  reserveHeight: number,
  inset: number,
) {
  const [fit, setFit] = useState<BookFit | null>(null);
  useEffect(() => {
    const el = root.current;
    if (!enabled || !el) return;
    const measure = () => {
      const next = fitBook({
        availableWidth: el.clientWidth - inset * 2,
        availableHeight: window.innerHeight - reserveHeight,
        page: size,
        minPageWidth,
        maxPageWidth,
      });
      setFit((prev) =>
        prev && prev.blockWidth === next.blockWidth && prev.orientation === next.orientation ? prev : next,
      );
    };
    // The observer reports once straight away, then on every change.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [root, enabled, size, minPageWidth, maxPageWidth, reserveHeight, inset]);
  return fit;
}

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
  ref,
}: BookSliderProps) {
  const root = useRef<HTMLDivElement>(null);
  const engine = useRef<FlipEngine | null>(null);
  const [reduced] = useState(prefersReducedMotion);
  const [state, setState] = useState<BookState | null>(null);
  const covers = mode === "book";
  const clipboard = mode === "clipboard";
  const fit = useFit(root, !clipboard, pageSize, minPageWidth, maxPageWidth, reserveHeight, clipboard ? 0 : FRAME_INSET);

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

  // A new size for the block: the engine only watches the window itself.
  const blockWidth = fit?.blockWidth;
  useEffect(() => {
    engine.current?.update();
  }, [blockWidth]);

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

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTextEntry(e.target) || document.querySelector("dialog[open]")) return;
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, next, prev]);

  const contentStyle: CSSProperties = clipboard
    ? {
        position: "absolute",
        width: pageSize.width,
        height: pageSize.height,
        left: (pageSize.height - pageSize.width) / 2,
        top: (pageSize.width - pageSize.height) / 2,
        transform: "rotate(-90deg)",
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
      };

  const ready = clipboard || fit !== null;
  const engineView = ready && (
    <PagesContext value={{ pages, contentStyle }}>
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
  const atStart = !state || state.page <= 0;
  const atEnd = !state || state.spread[state.spread.length - 1] >= state.total - 1;

  return (
    <div
      ref={root}
      className={`book-slider book-slider--${mode} w-full ${className}`.trim()}
      data-orientation={state?.orientation}
      data-open={covers && state && isOpen(state) ? "" : undefined}
    >
      <div
        role="region"
        aria-roledescription={mode === "clipboard" ? "form sheets" : "book"}
        aria-label={label}
        className="relative mx-auto"
        style={
          clipboard
            ? { width: pageSize.width, height: pageSize.height }
            : ({ width: fit?.blockWidth, "--page-scale": fit?.scale ?? 1 } as CSSProperties)
        }
      >
        {!clipboard && <div aria-hidden="true" className={covers ? "book-frame" : "folder-frame"} />}
        {clipboard ? (
          <div
            className="absolute"
            style={{
              width: pageSize.height,
              height: pageSize.width,
              left: (pageSize.width - pageSize.height) / 2,
              top: (pageSize.height - pageSize.width) / 2,
              transform: "rotate(90deg)",
            }}
          >
            {engineView}
          </div>
        ) : (
          engineView
        )}
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
