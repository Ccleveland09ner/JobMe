"use client";

/**
 * BookSlider's adapter to react-pageflip (StPageFlip): the calls it uses, the
 * settings for each mode, and one engine per document. The engine keeps its
 * own copy of the page elements and moves their DOM, so page content reaches
 * them through context, and the engine is destroyed after React lets go.
 */

import { createContext, useContext, useLayoutEffect, useRef, type ComponentProps, type CSSProperties, type ReactNode, type Ref } from "react";
import HTMLFlipBook from "react-pageflip";

import { spreadAt, type BookOrientation, type BookState, type PageSize } from "@/lib/frontend/book-layout";

export type BookMode = "book" | "folder" | "clipboard";

/** The page-flip calls we use. */
export interface FlipEngine {
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
export function programmatic(engine: FlipEngine, turn: () => void) {
  const settings = engine.getSettings();
  const cornersOnly = settings.disableFlipByClick;
  settings.disableFlipByClick = false;
  try {
    turn();
  } finally {
    settings.disableFlipByClick = cornersOnly;
  }
}

export interface FlipEvent {
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

export function stateOf(engine: FlipEngine, covers: boolean): BookState {
  const total = engine.getPageCount();
  const page = engine.getCurrentPageIndex();
  const orientation = engine.getOrientation();
  return { page, spread: spreadAt(page, total, orientation, covers), total, orientation };
}

/** What a page element renders: its content, from the latest render. */
export const PagesContext = createContext<{ pages: ReactNode[]; contentStyle: CSSProperties }>({ pages: [], contentStyle: {} });

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
export function Engine({ count, settings, pageClassName, hardPage, onInit, onFlip, onChangeOrientation, onTeardown }: EngineProps) {
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

export function settingsFor(
  mode: BookMode,
  size: PageSize,
  minPageWidth: number,
  maxPageWidth: number,
  startPage: number,
  reduced: boolean,
): FlipSettings {
  const common = {
    startPage,
    drawShadow: !reduced,
    startZIndex: 0,
    mobileScrollSupport: true,
    clickEventForward: true,
    swipeDistance: 30,
  };
  if (mode === "clipboard") {
    // Laid out sideways and turned upright (clipboardFrame): the engine's
    // single-page turn then lifts the sheet from the bottom and over the top edge.
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
