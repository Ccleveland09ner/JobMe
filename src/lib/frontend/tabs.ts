/** A strip of tabs too long to show at once: which run of them is on show (pure). */

/**
 * The first tab on show, moved as little as possible so that tab `index`
 * is among the `size` shown.
 */
export function windowStart(total: number, size: number, index: number, start: number): number {
  const last = Math.max(0, total - Math.max(1, size));
  const from = Math.min(Math.max(0, start), last);
  if (index < from) return Math.max(0, index);
  if (index >= from + size) return Math.min(last, index - size + 1);
  return from;
}
