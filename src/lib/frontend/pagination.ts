/** Pagination arithmetic for collections (not interview progress). */

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
