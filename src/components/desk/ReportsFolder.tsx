"use client";

/**
 * The reports folder: one file per finished interview, each with a tab on
 * the folder's top edge. A file is a booklet of fixed-size sheets turned like
 * paper: the inside flap with its label, then the summary, performance,
 * question-by-question feedback, the rewrite and the transcript. Choosing a
 * tab swaps the file in place (fetched once, through RLS) and keeps the URL
 * in step without leaving the folder.
 */

import { useRouter } from "next/navigation";
import { useCallback, useId, useMemo, useRef, useState } from "react";

import { LocalDate } from "@/components/common/LocalDate";
import { CloseTag, useHeldShell } from "@/components/held/Held";
import { BookSlider, FlipSafe, type BookSliderHandle } from "@/components/ui/book-slider";
import { DOC_BODY_HEIGHT, DOC_BODY_WIDTH, DOC_PAGE, DocumentPage } from "@/components/ui/DocumentPage";
import { DocumentTabs } from "@/components/ui/DocumentTabs";
import { usePaginatedPages, type DocBlock } from "@/components/ui/usePaginatedPages";
import { MODE_LABELS } from "@/lib/frontend/labels";
import type { PagePlan } from "@/lib/frontend/paginate";
import {
  describeFolder,
  folderBook,
  folderFlow,
  FOLDER_FLOW_START,
  FOLDER_SECTIONS,
  isFiled,
  loadReportDocument,
  sectionStarts,
  tabFor,
  withGeneratedReport,
  type FolderSection,
  type GeneratedReport,
  type ReportDocument,
  type ReportTab,
} from "@/lib/frontend/report-document";
import { createClient } from "@/lib/supabase/client";

import { BlankPage, EmptyFolderPage, FlapPage, FolderBlockView, GeneratePage } from "./ReportSheets";

const PAGE_SIZE = { width: DOC_PAGE.width, height: DOC_PAGE.height };

let browserClient: ReturnType<typeof createClient> | null = null;
const supabase = () => (browserClient ??= createClient());

/** Moves focus to an element on the page just turned to. */
function focusOn(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
  el.focus({ preventScroll: true });
}

/** A laid-out file: what the folder shows. */
interface Filed {
  key: string;
  doc: ReportDocument | null;
  plan: PagePlan[];
  blocks: DocBlock[];
}

export function ReportsFolder({ initial, index }: { initial: ReportDocument | null; index: ReportTab[] }) {
  const router = useRouter();
  const close = useCallback(() => router.push("/dashboard"), [router]);
  const { closing, heading } = useHeldShell("reports", close);
  const headingId = useId();
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

  const tabs = useMemo(() => {
    const list = [...index];
    if (initial && !list.some((t) => t.id === initial.id)) list.unshift(tabFor(initial));
    return list;
  }, [index, initial]);

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
  const [shown, setShown] = useState<Filed | null>(null);
  if (plan && shown?.key !== documentKey) setShown({ key: documentKey, doc, plan, blocks });
  const view: Filed | null = plan ? { key: documentKey, doc, plan, blocks } : shown;

  function show(id: string) {
    setActiveId(id);
    // Same folder, another file: no navigation, no server round trip.
    window.history.replaceState(null, "", `/interview/${id}/report`);
  }

  async function openTab(id: string) {
    wanted.current = id;
    setFailure(null);
    if (id === activeId) return;
    if (docs.has(id)) return show(id);
    setOpening(id);
    try {
      const loaded = await loadReportDocument(supabase(), id);
      if (!loaded) throw new Error("not found");
      setDocs((m) => new Map(m).set(id, loaded));
      if (wanted.current === id) show(id);
    } catch {
      if (wanted.current === id) setFailure({ id, message: "We couldn't open that report. Check your connection and try again." });
    } finally {
      setOpening((o) => (o === id ? null : o));
    }
  }

  const onGenerated = useCallback(
    (body: GeneratedReport) => {
      if (!doc) return;
      setDocs((m) => new Map(m).set(doc.id, withGeneratedReport(doc, body)));
    },
    [doc],
  );

  // A contents line turns to its page, then hands focus to its heading.
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

  const pages = view && folderBook(view.doc, view.plan);
  const nodes = new Map(view?.blocks.map((b) => [b.id, b.node]));
  // Each flow page runs under the section it belongs to.
  const sectionAt = (ids: string[]): FolderSection | null => {
    if (!view) return null;
    const flowIds = view.blocks.map((b) => b.id);
    const at = flowIds.indexOf(ids[0]);
    for (let i = at; i >= 0; i--) {
      const s = FOLDER_SECTIONS.find((x) => x.id === flowIds[i]);
      if (s) return s.id;
    }
    return null;
  };
  const pageNodes = pages?.map((p, i) => {
    switch (p.kind) {
      case "flap":
        return <FlapPage doc={view?.doc ?? null} starts={sectionStarts(pages)} onOpen={openAt} />;
      case "generate":
        return view?.doc ? <GeneratePage doc={view.doc} onGenerated={onGenerated} /> : <BlankPage number={i} />;
      case "empty":
        return <EmptyFolderPage />;
      case "blank":
        return <BlankPage number={i} />;
      case "flow": {
        const section = sectionAt(p.ids);
        return (
          <DocumentPage number={i} running={FOLDER_SECTIONS.find((s) => s.id === section)?.title}>
            {p.ids.map((id) => (
              <FlipSafe key={id}>{nodes.get(id)}</FlipSafe>
            ))}
          </DocumentPage>
        );
      }
    }
  });

  return (
    <section
      aria-labelledby={headingId}
      className={`relative flex w-full max-w-6xl flex-col items-center ${closing ? "held-out" : "held-in"}`}
    >
      <h1 id={headingId} ref={heading} tabIndex={-1} className="sr-only">
        Interview reports
      </h1>
      {measurer}
      {pageNodes && (
        <div id={panelId} role={tabs.length ? "tabpanel" : undefined} aria-labelledby={activeId ? `${tabsId}-${activeId}` : undefined} className="w-full">
          <BookSlider
            ref={slider}
            mode="folder"
            pages={pageNodes}
            pageSize={PAGE_SIZE}
            documentKey={view?.key ?? "report:none"}
            label={view?.doc ? `Report: ${view.doc.title ?? "Behavioral interview"}` : "Reports folder"}
            reserveHeight={230}
            describe={describeFolder}
            onPageChange={onPageChange}
            className="pt-24 sm:pt-14"
          >
            {tabs.length > 0 && (
              <DocumentTabs
                tabs={tabs.map((t) => ({
                  id: t.id,
                  label: <LocalDate iso={t.startedAt} format="short" />,
                  detail: t.title ?? (t.mode ? MODE_LABELS[t.mode] : "Interview"),
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
    </section>
  );
}
