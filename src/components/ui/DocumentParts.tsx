/**
 * Small parts printed on the ledger's and the folder's pages: the kicker
 * (spaced capitals above a heading), a labelled figure, and a contents list
 * whose lines turn to their page.
 */

import type { ReactNode } from "react";

/** Spaced capitals above a heading, or for a minor heading. */
export const kickerClass = "text-[11px] font-bold uppercase tracking-[0.2em] text-muted";

/** A labelled figure, inside a <dl>. */
export function PaperStat({
  label,
  value,
  note,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  note?: string;
  size?: "md" | "lg";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`${size === "lg" ? "text-xl" : "text-lg"} font-semibold tabular-nums text-ink`}>{value}</dd>
      {note && <dd className="text-xs text-muted">{note}</dd>}
    </div>
  );
}

export interface ContentsItem {
  key: string;
  label: ReactNode;
  page: number;
  /** What to focus once the page has been turned to. */
  focusId: string;
}

/** Contents with dotted leaders to the page numbers; a line turns to its page. */
export function ContentsList({
  items,
  onOpen,
}: {
  items: ContentsItem[];
  onOpen: (page: number, focusId: string) => void;
}) {
  return (
    <ol className="flex flex-col">
      {items.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            onClick={() => onOpen(item.page, item.focusId)}
            className="flex w-full items-baseline gap-2 rounded-sm py-1 text-left text-sm text-ink hover:text-accent-strong"
          >
            <span className="min-w-0 truncate">{item.label}</span>
            <span aria-hidden="true" className="flex-1 border-b-2 border-dotted border-ink/30" />
            <span aria-hidden="true" className="tabular-nums">
              {item.page}
            </span>
            <span className="sr-only">, page {item.page}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
