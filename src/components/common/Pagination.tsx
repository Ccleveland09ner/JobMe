/**
 * Pagination for collections (dashboard history, long tables). Not for
 * interview progress — that is room/ProgressPill.
 *
 * Two modes, same markup:
 *   - `hrefForPage`  -> links. For server-rendered lists paged by URL; works
 *                       without JavaScript and survives refresh/back.
 *   - `onPageChange` -> buttons. For client-side lists.
 *
 * Deliberately no "use client": with `hrefForPage` it renders on the server.
 * A client parent passing `onPageChange` makes it a client component anyway.
 *
 * The slot count is constant (see pageWindow), so the control does not shift
 * the layout as the current page moves.
 */

import Link from "next/link";
import type { ReactNode } from "react";

import { pageCount, pageWindow } from "@/lib/frontend/pagination";
import { buttonClasses } from "@/components/ui/Button";

export type PaginationProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  /** Accessible name for the nav landmark, e.g. "Interview history pages". */
  label?: string;
} & (
  | { hrefForPage: (page: number) => string; onPageChange?: never }
  | { onPageChange: (page: number) => void; hrefForPage?: never }
);

const SLOT = "min-w-9 justify-center tabular-nums";

export function Pagination(props: PaginationProps) {
  const { page, pageSize, totalItems, label = "Pagination" } = props;
  const totalPages = pageCount(totalItems, pageSize);
  if (totalPages <= 1) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  function control(target: number, content: ReactNode, aria: string, opts: { current?: boolean; disabled?: boolean } = {}) {
    const className = buttonClasses({
      variant: opts.current ? "primary" : "secondary",
      size: "sm",
      className: SLOT,
    });
    if (opts.disabled) {
      return (
        <span aria-disabled="true" aria-label={aria} className={className}>
          {content}
        </span>
      );
    }
    const current = opts.current ? ("page" as const) : undefined;
    if ("hrefForPage" in props && props.hrefForPage) {
      return (
        <Link href={props.hrefForPage(target)} aria-label={aria} aria-current={current} className={className} scroll={false}>
          {content}
        </Link>
      );
    }
    return (
      <button
        type="button"
        aria-label={aria}
        aria-current={current}
        className={className}
        onClick={() => props.onPageChange?.(target)}
      >
        {content}
      </button>
    );
  }

  return (
    <nav aria-label={label} className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-sm text-muted" aria-live="polite">
        Showing {first}–{last} of {totalItems}
      </p>
      <ul className="flex flex-wrap items-center gap-1">
        <li>{control(page - 1, "Previous", "Previous page", { disabled: page <= 1 })}</li>
        {pageWindow(page, totalPages).map((slot, i) => (
          <li key={slot === "gap" ? `gap-${i}` : slot} className="hidden sm:block">
            {slot === "gap" ? (
              <span aria-hidden="true" className={`inline-flex px-1 text-muted ${SLOT}`}>
                …
              </span>
            ) : (
              control(slot, slot, `Page ${slot}`, { current: slot === page })
            )}
          </li>
        ))}
        <li className="px-2 text-sm text-muted sm:hidden">
          Page {page} of {totalPages}
        </li>
        <li>{control(page + 1, "Next", "Next page", { disabled: page >= totalPages })}</li>
      </ul>
    </nav>
  );
}
