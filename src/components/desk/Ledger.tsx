"use client";

/**
 * The dashboard as the ledger on the front desk: a bound volume of the user's
 * interviews, newest first, opened from its cover and turned page by page.
 * Each interview starts on a left-hand page with its overview; its summary,
 * questions, answers and notes run on from the facing page. Older interviews
 * are in later volumes (`?page=`).
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type { TrendPoint } from "@/components/dashboard/TrendChart";
import { useDeleteSession } from "@/components/dashboard/useDeleteSession";
import { CloseTag, useHeldShell } from "@/components/held/Held";
import { BookSlider, FlipSafe, type BookSliderHandle, type BookState } from "@/components/ui/book-slider";
import { DOC_BODY_HEIGHT, DOC_BODY_WIDTH, DOC_PAGE, DocumentPage } from "@/components/ui/DocumentPage";
import { usePaginatedPages, type DocBlock } from "@/components/ui/usePaginatedPages";
import { isLeftPage } from "@/lib/frontend/book-layout";
import {
  describeLedger,
  LEDGER_FLOW_START,
  ledgerBook,
  ledgerFlow,
  ledgerStartPage,
  pageOf,
  type LedgerEntry,
} from "@/lib/frontend/ledger";
import { prefersReducedMotion } from "@/lib/voice/audio-graph";

import {
  BackCoverPage,
  BookplatePage,
  ContentsPage,
  CoverPage,
  EmptyPage,
  EndPage,
  entryNumber,
  entryTitle,
  LedgerBlockView,
  NotesPage,
  ProgressPage,
  TrendsPage,
  type LedgerOwner,
  type LedgerProgress,
  type LedgerVolume,
} from "./LedgerPages";

const PAGE_SIZE = { width: DOC_PAGE.width, height: DOC_PAGE.height };
const leftPage = (i: number) => isLeftPage(i, true);
/** The cover opens once the ledger has settled in the hands (held-in). */
const OPEN_DELAY_MS = 380;

/** Moves focus to an element on the page just turned to. */
function focusOn(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
  el.focus({ preventScroll: true });
}

export function Ledger({
  owner,
  volume,
  entries,
  progress,
  trend,
  link,
}: {
  owner: LedgerOwner | null;
  volume: LedgerVolume;
  entries: LedgerEntry[];
  progress: LedgerProgress;
  trend: TrendPoint[];
  /** Where the URL asks the book to open. */
  link: { section?: string; entry?: string };
}) {
  const router = useRouter();
  const close = useCallback(() => router.push("/dashboard"), [router]);
  const { closing, heading } = useHeldShell("ledger", close);
  const headingId = useId();
  const slider = useRef<BookSliderHandle>(null);
  const { request: requestDelete, dialog } = useDeleteSession(() => heading.current?.focus({ preventScroll: true }));

  const flow = useMemo(() => ledgerFlow(entries), [entries]);
  const documentKey = `ledger:${volume.number}:${entries
    .map((e) => `${e.id}.${e.status}.${e.questions.length}.${e.summary ? 1 : 0}`)
    .join(",")}`;
  const blocks = useMemo<DocBlock[]>(
    () =>
      flow.map((b) => ({
        id: b.id,
        breakBefore: b.breakBefore,
        startOnLeft: b.startOnLeft,
        keepWithNext: b.keepWithNext,
        node: <LedgerBlockView block={b} entry={entries[b.entry]} volume={volume} onDelete={requestDelete} />,
      })),
    [flow, entries, volume, requestDelete],
  );
  const { pages: plan, measurer } = usePaginatedPages(blocks, {
    documentKey,
    width: DOC_BODY_WIDTH,
    capacity: DOC_BODY_HEIGHT,
    gap: DOC_PAGE.gap,
    firstPage: LEDGER_FLOW_START,
    isLeft: leftPage,
  });
  const book = useMemo(() => (plan ? ledgerBook(plan, entries.length === 0) : null), [plan, entries.length]);

  // First time round the book opens from its cover; after a delete or a
  // change of volume it is already open, at the contents.
  const [reduced] = useState(prefersReducedMotion);
  const [firstKey] = useState(documentKey);
  const linked = book ? ledgerStartPage(book, link) : null;
  const startPage = linked ?? (documentKey === firstKey && !reduced ? 0 : 1);

  const openTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(openTimer.current), []);
  const openCover = useCallback((state: BookState) => {
    if (state.page === 0) openTimer.current = window.setTimeout(() => slider.current?.next(), OPEN_DELAY_MS);
  }, []);

  // A contents link turns to its page, then hands focus to what it names.
  const arriving = useRef<string | null>(null);
  const openAt = useCallback((page: number, focusId: string) => {
    arriving.current = focusId;
    slider.current?.turnTo(page);
  }, []);
  const onPageChange = useCallback(() => {
    const id = arriving.current;
    arriving.current = null;
    if (id) focusOn(id);
  }, []);

  const nodes = new Map(blocks.map((b) => [b.id, b.node]));
  const entryOf = new Map(flow.map((b) => [b.id, b.entry]));
  const pages = book?.map((p, i) => {
    switch (p.kind) {
      case "cover":
        return <CoverPage volume={volume} owner={owner} />;
      case "bookplate":
        return <BookplatePage owner={owner} volume={volume} shown={entries.length} />;
      case "contents":
        return (
          <ContentsPage
            volume={volume}
            entries={entries}
            overviewPages={entries.map((e) => pageOf(book, `ov-${e.id}`))}
            onOpen={openAt}
          />
        );
      case "progress":
        return <ProgressPage progress={progress} />;
      case "trends":
        return <TrendsPage trend={trend} />;
      case "flow": {
        const at = entryOf.get(p.ids[0]) ?? 0;
        return (
          <DocumentPage
            face="ledger"
            number={i}
            running={
              <span className="min-w-0 truncate">
                No. {entryNumber(volume, at)} · {entryTitle(entries[at])}
              </span>
            }
          >
            {p.ids.map((id) => (
              <FlipSafe key={id}>{nodes.get(id)}</FlipSafe>
            ))}
          </DocumentPage>
        );
      }
      case "notes":
        return <NotesPage number={i} />;
      case "end":
        return <EndPage volume={volume} number={i} />;
      case "empty":
        return <EmptyPage />;
      case "back":
        return <BackCoverPage />;
    }
  });

  return (
    <section
      aria-labelledby={headingId}
      className={`relative flex w-full max-w-6xl flex-col items-center ${closing ? "held-out" : "held-in"}`}
    >
      <h1 id={headingId} ref={heading} tabIndex={-1} className="sr-only">
        Performance record
      </h1>
      {measurer}
      {pages && (
        <BookSlider
          ref={slider}
          mode="book"
          pages={pages}
          pageSize={PAGE_SIZE}
          documentKey={documentKey}
          label={`Performance record, volume ${volume.number}`}
          startPage={startPage}
          reserveHeight={200}
          describe={describeLedger}
          onReady={startPage === 0 ? openCover : undefined}
          onPageChange={onPageChange}
          className="pt-8"
        >
          <CloseTag onClick={close} className="absolute -top-8 right-14 z-30">
            Close the ledger
          </CloseTag>
        </BookSlider>
      )}
      {dialog}
    </section>
  );
}
