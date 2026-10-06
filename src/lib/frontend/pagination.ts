/**
 * Pagination arithmetic for collection views (dashboard history, long
 * tables). Not for interview progress — that is ProgressView.
 */

export function pageCount(totalItems: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, totalItems) / pageSize));
}

/** Coerces any input (a query param, NaN) into a valid 1-based page. */
export function clampPage(page: unknown, totalPages: number): number {
  const n = typeof page === "string" ? Number.parseInt(page, 10) : Number(page);
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(1, Math.trunc(n)), Math.max(1, totalPages));
}

/** Zero-based [from, to] row range for a page, inclusive — Supabase `.range()`. */
export function rowRange(page: number, pageSize: number): [number, number] {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}

export type PageSlot = number | "gap";

/**
 * Page numbers to render: always first and last, a window around the current
 * page, and "gap" where pages are skipped. Never more than `2 * radius + 5`
 * slots, so the control keeps a stable width as counts change.
 */
export function pageWindow(page: number, totalPages: number, radius = 1): PageSlot[] {
  if (totalPages <= 2 * radius + 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const start = Math.max(2, Math.min(page - radius, totalPages - 2 * radius - 2));
  const end = Math.min(totalPages - 1, Math.max(page + radius, 2 * radius + 3));
  const slots: PageSlot[] = [1];
  if (start > 2) slots.push("gap");
  for (let p = start; p <= end; p++) slots.push(p);
  if (end < totalPages - 1) slots.push("gap");
  slots.push(totalPages);
  return slots;
}
