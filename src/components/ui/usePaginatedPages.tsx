"use client";

/**
 * Lays a document's blocks out on fixed-size pages: renders them once,
 * hidden, at the page's content width, measures them (after the fonts have
 * loaded), and packs them (lib/frontend/paginate.ts). Measured once per
 * `documentKey`, so turning pages never re-measures.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

import { packPages, type FlowBlock, type PagePlan } from "@/lib/frontend/paginate";

export interface DocBlock extends Omit<FlowBlock, "height"> {
  node: ReactNode;
}

export interface PaginateOptions {
  documentKey: string;
  /** Content width of a page, px. */
  width: number;
  /** Content height of a page, px. */
  capacity: number;
  gap: number;
  firstPage?: number;
  isLeft?: (pageIndex: number) => boolean;
}

export function usePaginatedPages(blocks: DocBlock[], { documentKey, width, capacity, gap, firstPage, isLeft }: PaginateOptions) {
  const box = useRef<HTMLDivElement>(null);
  const [plan, setPlan] = useState<{ key: string; pages: PagePlan[] } | null>(null);
  const pages = plan?.key === documentKey ? plan.pages : null;

  const latest = useRef({ blocks, capacity, gap, firstPage, isLeft });
  useEffect(() => {
    latest.current = { blocks, capacity, gap, firstPage, isLeft };
  });

  const measured = pages !== null;
  useEffect(() => {
    if (measured) return;
    let cancelled = false;
    let frame = 0;
    const nextFrame = () => new Promise<void>((resolve) => (frame = requestAnimationFrame(() => resolve())));
    void (async () => {
      // Laying the blocks out is what starts loading a font they need (a
      // fallback for a glyph the main font lacks), so lay out, then wait.
      for (let tries = 0; tries < 3; tries++) {
        void box.current?.offsetHeight;
        await (document.fonts?.ready ?? Promise.resolve());
        await nextFrame();
        if (cancelled || document.fonts?.status !== "loading") break;
      }
      const root = box.current;
      if (cancelled || !root) return;
      // Layout heights: the document may be mid-animation (held-in scales
      // it), which a bounding box would include.
      const heights = new Map<string, number>();
      for (const el of root.children) {
        const id = (el as HTMLElement).dataset.block;
        if (id) heights.set(id, Math.ceil(parseFloat(getComputedStyle(el).height)));
      }
      const now = latest.current;
      const flow: FlowBlock[] = now.blocks.map((b) => ({
        id: b.id,
        breakBefore: b.breakBefore,
        startOnLeft: b.startOnLeft,
        keepWithNext: b.keepWithNext,
        height: heights.get(b.id) ?? 0,
      }));
      setPlan({
        key: documentKey,
        pages: packPages(flow, { capacity: now.capacity, gap: now.gap, firstPage: now.firstPage, isLeft: now.isLeft }),
      });
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [documentKey, measured]);

  const measurer = measured ? null : (
    <div ref={box} aria-hidden="true" inert className="pointer-events-none invisible fixed left-[-10000px] top-0" style={{ width }}>
      {blocks.map((b) => (
        <div key={b.id} data-block={b.id}>
          {b.node}
        </div>
      ))}
    </div>
  );

  return { pages, measurer };
}
