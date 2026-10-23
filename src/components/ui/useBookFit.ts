"use client";

import { useEffect, useState, type RefObject } from "react";

import { fitBook, type BookFit, type PageSize } from "@/lib/frontend/book-layout";

/** The book's fit to the space it is given, kept up to date with the window. */
export function useBookFit(
  root: RefObject<HTMLDivElement | null>,
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
