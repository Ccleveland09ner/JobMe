/**
 * Small parts printed on the ledger's and the folder's pages: the kicker
 * (spaced capitals above a heading), a labelled figure, a contents list whose
 * lines turn to their page, and the pieces both documents print the same way.
 */

import Link from "next/link";
import type { ReactNode } from "react";

import { LocalDate } from "@/components/common/LocalDate";
import type { InterviewMode } from "@/lib/engine/types";
import { MODE_LABELS } from "@/lib/frontend/labels";

import { buttonClasses, type ButtonSize } from "./Button";
import { DocumentPage, type PageFace } from "./DocumentPage";
import { FlipSafe } from "./FlipSafe";

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

/** A page of laid-out blocks, each kept whole through a page turn. */
export function FlowPage({
  ids,
  nodes,
  number,
  running,
  face,
}: {
  ids: string[];
  nodes: Map<string, ReactNode>;
  number: number;
  running?: ReactNode;
  face?: PageFace;
}) {
  return (
    <DocumentPage face={face} number={number} running={running}>
      {ids.map((id) => (
        <FlipSafe key={id}>{nodes.get(id)}</FlipSafe>
      ))}
    </DocumentPage>
  );
}

/** When an interview was, and its length when the title doesn't already say it. */
export function SessionDateLine({ startedAt, mode, titled }: { startedAt: string; mode: InterviewMode | null; titled: boolean }) {
  return (
    <>
      <LocalDate iso={startedAt} format="dateTime" />
      {mode && titled && ` · ${MODE_LABELS[mode]}`}
    </>
  );
}

/** Speaking rate and filler words; a dash for what wasn't measured. */
export function SpeakingStats({
  wpm,
  fillers,
  size,
  explainWpm = false,
  className,
}: {
  wpm: number | null;
  fillers: number | null;
  size?: "md" | "lg";
  /** Say why a missing rate is missing. */
  explainWpm?: boolean;
  className?: string;
}) {
  return (
    <dl className={className}>
      <PaperStat
        size={size}
        label="Words per minute"
        value={wpm ?? "—"}
        note={explainWpm && wpm === null ? "Measured on spoken answers only." : undefined}
      />
      <PaperStat size={size} label="Filler words (approx.)" value={fillers ?? "—"} />
    </dl>
  );
}

/** The way to a new interview, wherever a page offers one. */
export function StartInterviewLink({ size, className }: { size?: ButtonSize; className?: string }) {
  return (
    <Link href="/interview/new" className={buttonClasses({ size, className })}>
      Start an interview
    </Link>
  );
}
