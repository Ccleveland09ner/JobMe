"use client";

/**
 * The reports folder: one file per finished interview, each with a tab on
 * the folder's top edge. A file is a booklet of fixed-size sheets turned like
 * paper: the inside flap with its label, then the summary, the feedback, the
 * rewrite of the weakest answer and each question's scores and notes. The
 * transcript is the ledger's, and the flap links to it. Choosing a tab swaps
 * the file in place (fetched once, through RLS) and keeps the URL in step
 * without leaving the folder; deleting the interview on top brings the file
 * behind it forward the same way.
 */

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { LocalDate } from "@/components/common/LocalDate";
import { useAlive } from "@/components/common/useAlive";
import { useDeleteSession } from "@/components/dashboard/useDeleteSession";
import { CloseTag, HeldDocument, useHeldDocument } from "@/components/held/Held";
import { BookSlider, type BookSliderHandle } from "@/components/ui/book-slider";
import { FlowPage } from "@/components/ui/DocumentParts";
import { DOC_BODY_HEIGHT, DOC_BODY_WIDTH, DOC_PAGE, DOC_PAGE_SIZE } from "@/components/ui/DocumentPage";
import { DocumentTabs } from "@/components/ui/DocumentTabs";
import { useLastReady } from "@/components/ui/useLastReady";
import { usePaginatedPages, type DocBlock } from "@/components/ui/usePaginatedPages";
import { useDeletedInterviews } from "@/lib/frontend/deleted";
import { interviewTitle } from "@/lib/frontend/labels";
import type { PagePlan } from "@/lib/frontend/paginate";
import {
  describeFolder,
  folderBook,
  folderFlow,
  FOLDER_FLOW_START,
  FOLDER_SECTIONS,
  isFiled,
  loadReportDocument,
  reportIdIn,
  reportPath,
  sectionStarts,
  tabAfterDelete,
  tabFor,
  withGeneratedReport,
  type FolderSection,
  type GeneratedReport,
  type ReportDocument,
  type ReportTab,
} from "@/lib/frontend/report-document";
import { createClient } from "@/lib/supabase/client";

import { BlankPage, EmptyFolderPage, FlapPage, FolderBlockView, GeneratePage } from "./ReportSheets";

/** A laid-out file: what the folder shows. */
interface Filed {
  doc: ReportDocument | null;
  plan: PagePlan[];
  blocks: DocBlock[];
}

/** The bare folder: where it is left once its last file is deleted. */
const REPORTS_PATH = "/reports";

export function ReportsFolder({ initial, index }: { initial: ReportDocument | null; index: ReportTab[] }) {
  const router = useRouter();
  const alive = useAlive();
  const { close, closing, heading, headingId } = useHeldDocument("reports");
  const panelId = useId();
  const tabsId = useId();
  const slider = useRef<BookSliderHandle>(null);

  // Files fetched so far, and the one on top.
  const [docs, setDocs] = useState(() => new Map(initial ? [[initial.id, initial]] : []));
  const [activeId, setActiveId] = useState(initial?.id ?? null);
  const [opening, setOpening] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  // The latest tab asked for: a slower earlier fetch must not win.
  const wanted = useRef(activeId);
  // The file being deleted from on top, while the next comes forward.
  const leaving = useRef<string | null>(null);

  const allTabs = useMemo(() => {
    const list = [...index];
    if (initial && !list.some((t) => t.id === initial.id)) list.unshift(tabFor(initial));
    return list;
  }, [index, initial]);
  // Interviews deleted in this tab, here or in the ledger, lose their tab at once.
  const deleted = useDeletedInterviews();
  const tabs = useMemo(() => allTabs.filter((t) => !deleted.has(t.id)), [allTabs, deleted]);

  const doc = activeId ? (docs.get(activeId) ?? null) : null;
  const documentKey = doc ? `report:${doc.id}:${isFiled(doc) ? "filed" : "pending"}` : "report:none";
  const flow = useMemo(() => (doc ? folderFlow(doc) : []), [doc]);
  const blocks = useMemo<DocBlock[]>(
    () =>
      doc
        ? flow.map((b) => ({
            id: b.id,
            breakBefore: b.breakBefore,
            startOnLeft: b.startOnLeft,
            keepWithNext: b.keepWithNext,
            node: <FolderBlockView block={b} doc={doc} />,
          }))
        : [],
    [flow, doc],
  );
  const { pages: plan, measurer } = usePaginatedPages(blocks, {
    documentKey,
    width: DOC_BODY_WIDTH,
    capacity: DOC_BODY_HEIGHT,
    gap: DOC_PAGE.gap,
    firstPage: FOLDER_FLOW_START,
  });

  // The last file laid out stays in the folder while the next is measured.
  const ready = useMemo<Filed | null>(() => (plan ? { doc, plan, blocks } : null), [plan, doc, blocks]);
  const shown = useLastReady(documentKey, ready);
  const view = shown?.value ?? null;

  function show(id: string) {
    setActiveId(id);
    // Same folder, another file: no navigation, no server round trip.
    window.history.replaceState(null, "", reportPath(id));
  }

  async function openTab(id: string) {
    wanted.current = id;
    setFailure(null);
    if (id === activeId) return;
    if (docs.has(id)) return show(id);
    setOpening(id);
    try {
      const loaded = await loadReportDocument(createClient(), id);
      if (!loaded) throw new Error("not found");
      // Put down in the meantime: the URL is no longer the folder's to change.
      if (!alive.current) return;
      setDocs((m) => new Map(m).set(id, loaded));
      if (wanted.current === id) show(id);
    } catch {
      if (wanted.current === id) setFailure({ id, message: "We couldn't open that report. Check your connection and try again." });
    } finally {
      setOpening((o) => (o === id ? null : o));
    }
  }

  /**
   * The interview on top is being deleted: the file behind it comes forward,
   * or with none left the folder is empty. Awaited while the dialog still
   * says "Deleting…", before the delete is listed (useDeleteSession), so the
   * next file is on top by the time the deleted one loses its tab.
   */
  async function moveOff(id: string) {
    if (id !== activeId) return;
    leaving.current = id;
    const next = tabAfterDelete(allTabs, id, deleted);
    if (next) return openTab(next);
    wanted.current = null;
    setActiveId(null);
    window.history.replaceState(null, "", REPORTS_PATH);
  }

  const { request: requestDelete, dialog } = useDeleteSession({
    onDeleted: ({ id }) => moveOff(id),
    onClosed: () => heading.current?.focus({ preventScroll: true }),
  });

  // On top, yet deleted in this tab: Back or Forward brought the folder back
  // as it was before the delete. The report behind it comes from the server.
  // A delete made here is moving off by itself (the store's update can render
  // before the folder's own), and if that fails the folder says so instead.
  const stale = activeId !== null && deleted.has(activeId) ? activeId : null;
  useEffect(() => {
    if (!stale || leaving.current === stale) return;
    const next = tabAfterDelete(allTabs, stale, deleted);
    router.replace(next ? reportPath(next) : REPORTS_PATH);
  }, [stale, allTabs, deleted, router]);

  // The URL names the file on top. Back or Forward can return to an entry
  // whose page was laid out for another file (Next restores the page it
  // copied into that entry), so when the URL changes, the folder follows it.
  const routeId = reportIdIn(usePathname());
  const followed = useRef(activeId);
  useEffect(() => {
    if (!routeId || routeId === followed.current) return;
    followed.current = routeId;
    if (routeId !== wanted.current) void openTab(routeId);
  });

  const onGenerated = useCallback(
    (body: GeneratedReport) => {
      if (!doc) return;
      setDocs((m) => new Map(m).set(doc.id, withGeneratedReport(doc, body)));
    },
    [doc],
  );

  // A contents line turns to its page, then hands focus to what it names.
  const openAt = useCallback((page: number, focus: string) => slider.current?.turnTo(page, { focus }), []);

  const pageNodes = useMemo(() => {
    if (!view) return null;
    const pages = folderBook(view.doc, view.plan);
    const nodes = new Map(view.blocks.map((b) => [b.id, b.node]));
    // Each flow page runs under the section it belongs to.
    const flowIds = view.blocks.map((b) => b.id);
    const sectionAt = (ids: string[]): FolderSection | null => {
      const at = flowIds.indexOf(ids[0]);
      for (let i = at; i >= 0; i--) {
        const s = FOLDER_SECTIONS.find((x) => x.id === flowIds[i]);
        if (s) return s.id;
      }
      return null;
    };
    const filed = view.doc;
    return pages.map((p, i) => {
      switch (p.kind) {
        case "flap":
          return (
            <FlapPage
              doc={filed}
              starts={sectionStarts(pages)}
              onOpen={openAt}
              onDelete={filed ? () => requestDelete(filed) : undefined}
            />
          );
        case "generate":
          return filed ? <GeneratePage doc={filed} onGenerated={onGenerated} /> : <BlankPage number={i} />;
        case "empty":
          return <EmptyFolderPage />;
        case "blank":
          return <BlankPage number={i} />;
        case "flow": {
          const section = sectionAt(p.ids);
          return <FlowPage number={i} ids={p.ids} nodes={nodes} running={FOLDER_SECTIONS.find((s) => s.id === section)?.title} />;
        }
      }
    });
  }, [view, openAt, onGenerated, requestDelete]);

  return (
    <HeldDocument title="Interview reports" headingId={headingId} heading={heading} closing={closing}>
      {measurer}
      {pageNodes && (
        <div className="w-full">
          <BookSlider
            ref={slider}
            mode="folder"
            pages={pageNodes}
            pageSize={DOC_PAGE_SIZE}
            documentKey={shown?.key ?? "report:none"}
            // Also the tab panel's name: a tab may be paged out of view.
            label={view?.doc ? `Report: ${interviewTitle(view.doc.title, view.doc.mode)}` : "Reports folder"}
            tabPanelId={tabs.length ? panelId : undefined}
            reserveHeight={230}
            describe={describeFolder}
            className="pt-24 sm:pt-14"
          >
            {tabs.length > 0 && (
              <DocumentTabs
                tabs={tabs.map((t) => ({
                  id: t.id,
                  label: <LocalDate iso={t.startedAt} format="short" />,
                  detail: interviewTitle(t.title, t.mode),
                }))}
                active={activeId}
                onSelect={openTab}
                busy={opening}
                label="Reports"
                tabId={(id) => `${tabsId}-${id}`}
                panelId={panelId}
                pagerLabels={["Show newer reports", "Show older reports"]}
                className="absolute bottom-[calc(100%+10px)] left-3 right-3 sm:right-48"
              />
            )}
            <CloseTag onClick={close} className="absolute -top-24 right-2 z-30 sm:-top-12">
              Close the folder
            </CloseTag>
          </BookSlider>
          {failure && (
            <p role="alert" className="mx-auto mt-2 w-fit rounded-md border-2 border-ink bg-danger-soft px-3 py-1.5 text-sm text-danger">
              {failure.message}{" "}
              <button type="button" className="font-semibold underline" onClick={() => openTab(failure.id)}>
                Try again
              </button>
            </p>
          )}
        </div>
      )}
      {dialog}
    </HeldDocument>
  );
}
