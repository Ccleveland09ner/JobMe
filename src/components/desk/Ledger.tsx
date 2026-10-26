"use client";

/**
 * The ledger on the front desk: a bound volume of the user's interviews,
 * newest first, opened from its cover and turned page by page. Each interview
 * starts on a left-hand page with an account of it; its transcript runs on
 * from the facing page, question by question, and ends by pointing to its
 * report, which holds the summary and the feedback. Older interviews are in
 * later volumes (`?page=`).
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDeleteSession } from "@/components/dashboard/useDeleteSession";
import { CloseTag, HeldDocument, useHeldDocument } from "@/components/held/Held";
import { BookSlider, type BookSliderHandle, type BookState } from "@/components/ui/book-slider";
import { FlowPage } from "@/components/ui/DocumentParts";
import { DOC_BODY_HEIGHT, DOC_BODY_WIDTH, DOC_PAGE, DOC_PAGE_SIZE } from "@/components/ui/DocumentPage";
import { useLastReady } from "@/components/ui/useLastReady";
import { usePaginatedPages, type DocBlock } from "@/components/ui/usePaginatedPages";
import { isLeftPage } from "@/lib/frontend/book-layout";
import { useDeletedInterviews } from "@/lib/frontend/deleted";
import { interviewTitle } from "@/lib/frontend/labels";
import {
  describeLedger,
  entryNumber,
  LEDGER_FLOW_START,
  ledgerBook,
  ledgerFlow,
  ledgerStartPage,
  pageOf,
  type LedgerEntry,
  type LedgerOwner,
  type LedgerProgress,
  type LedgerVolume,
} from "@/lib/frontend/ledger";
import { prefersReducedMotion } from "@/lib/frontend/motion";
import type { TrendPoint } from "@/lib/frontend/types";

import {
  BackCoverPage,
  BookplatePage,
  ContentsPage,
  CoverPage,
  EmptyPage,
  EndPage,
  LedgerBlockView,
  NotesPage,
  ProgressPage,
  TrendsPage,
} from "./LedgerPages";

const leftPage = (i: number) => isLeftPage(i, true);
/** The cover opens once the ledger has settled in the hands (held-in). */
const OPEN_DELAY_MS = 380;

export function Ledger({
  owner,
  volume: printed,
  entries: listed,
  progress,
  trend: plotted,
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
  const { close, closing, heading, headingId } = useHeldDocument("ledger");
  const slider = useRef<BookSliderHandle>(null);
  const { request: requestDelete, dialog } = useDeleteSession({
    onClosed: () => heading.current?.focus({ preventScroll: true }),
  });

  // An interview deleted in this tab (here, or in the reports folder before
  // Back brought this page back) is left out at once; the server then
  // reprints the volume, numbers and counts included.
  const deleted = useDeletedInterviews();
  const entries = useMemo(() => listed.filter((e) => !deleted.has(e.id)), [listed, deleted]);
  const trend = useMemo(() => plotted.filter((p) => !deleted.has(p.id)), [plotted, deleted]);
  const gone = listed.length - entries.length;
  const volume = useMemo(() => (gone ? { ...printed, total: printed.total - gone } : printed), [printed, gone]);
  useEffect(() => {
    if (gone) router.refresh();
  }, [gone, router]);

  const flow = useMemo(() => ledgerFlow(entries), [entries]);
  const documentKey = `ledger:${volume.number}:${entries
    .map((e) => `${e.id}.${e.status}.${e.questions.length + e.followUps}`)
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
  // Deletes emptied this volume: the book on screen stays until the server
  // answers with the volume as it is now, which may no longer exist.
  const emptied = entries.length === 0 && listed.length > 0;
  const book = useMemo(
    () => (plan && !emptied ? ledgerBook(plan, entries.length === 0) : null),
    [plan, emptied, entries.length],
  );

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

  // A contents line turns to its page, then hands focus to what it names.
  const openAt = useCallback((page: number, focus: string) => slider.current?.turnTo(page, { focus }), []);

  const pages = useMemo(() => {
    if (!book) return null;
    const nodes = new Map(blocks.map((b) => [b.id, b.node]));
    const entryOf = new Map(flow.map((b) => [b.id, b.entry]));
    return book.map((p, i) => {
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
            <FlowPage
              face="ledger"
              number={i}
              ids={p.ids}
              nodes={nodes}
              running={
                <span className="min-w-0 truncate">
                  No. {entryNumber(volume, at)} · {interviewTitle(entries[at].title, entries[at].mode)}
                </span>
              }
            />
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
  }, [book, blocks, flow, volume, owner, entries, progress, trend, openAt]);
  // After a delete or a refresh, the book on screen stays open while the changed one is measured.
  const shown = useLastReady(documentKey, pages);

  return (
    <HeldDocument title="Interview record" headingId={headingId} heading={heading} closing={closing}>
      {measurer}
      {shown && (
        <BookSlider
          ref={slider}
          mode="book"
          pages={shown.value}
          pageSize={DOC_PAGE_SIZE}
          documentKey={shown.key}
          label={`Interview record, volume ${volume.number}`}
          startPage={startPage}
          reserveHeight={200}
          describe={describeLedger}
          onReady={startPage === 0 ? openCover : undefined}
          className="pt-8"
        >
          <CloseTag onClick={close} className="absolute -top-8 right-14 z-30">
            Close the ledger
          </CloseTag>
        </BookSlider>
      )}
      {dialog}
    </HeldDocument>
  );
}
