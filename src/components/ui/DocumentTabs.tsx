"use client";

/**
 * Tabs standing up from a document's top edge, like a folder's file tabs; the
 * chosen one raised and in front. WAI-ARIA tabs: one tab stop, arrow keys,
 * Home and End. A tab opens on Enter, Space or a click, since opening one can
 * take a moment. When there are more tabs than fit, a run of them is on show
 * with buttons to move along.
 */

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Spinner } from "@/components/ui/Spinner";
import { windowStart } from "@/lib/frontend/tabs";

export interface DocumentTab {
  id: string;
  label: ReactNode;
  detail?: ReactNode;
}

/** A tab's width with the gap after it, and the two paging buttons'. */
const TAB_SPAN = 136;
const PAGER_SPAN = 76;

export function DocumentTabs({
  tabs,
  active,
  onSelect,
  busy = null,
  label,
  tabId,
  panelId,
  pagerLabels,
  className = "",
}: {
  tabs: DocumentTab[];
  active: string | null;
  onSelect: (id: string) => void;
  /** The tab being opened. */
  busy?: string | null;
  /** What the tabs are, e.g. "Reports". */
  label: string;
  tabId: (id: string) => string;
  /** The element the tabs control. */
  panelId: string;
  /** The paging buttons' names: [back, on]. */
  pagerLabels: [string, string];
  className?: string;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.id === active));
  // The tab stop follows the open tab until the keyboard moves it.
  const [stop, setStop] = useState({ index: activeIndex, active });
  if (stop.active !== active) setStop({ index: activeIndex, active });
  const [start, setStart] = useState(0);
  const focusAfter = useRef(false);

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitsAll = width === null || tabs.length * TAB_SPAN <= width;
  const size = fitsAll ? tabs.length : Math.max(1, Math.floor((width - PAGER_SPAN) / TAB_SPAN));
  const from = windowStart(tabs.length, size, stop.index, start);
  const shown = tabs.slice(from, from + size);

  useEffect(() => {
    if (!focusAfter.current) return;
    focusAfter.current = false;
    const id = tabs[stop.index]?.id;
    if (id) document.getElementById(tabId(id))?.focus();
  }, [stop, tabs, tabId]);

  function moveTo(index: number) {
    const next = (index + tabs.length) % tabs.length;
    focusAfter.current = true;
    setStop({ index: next, active });
    setStart(windowStart(tabs.length, size, next, from));
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const to =
      e.key === "ArrowRight" ? index + 1 : e.key === "ArrowLeft" ? index - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (to === null) return;
    // Also keeps the arrows from turning the pages behind.
    e.preventDefault();
    moveTo(to);
  }

  function page(by: number) {
    const next = Math.min(Math.max(0, from + by), Math.max(0, tabs.length - size));
    setStart(next);
    setStop({ index: by < 0 ? next : Math.min(tabs.length - 1, next + size - 1), active });
  }

  return (
    <div ref={strip} className={`flex items-end gap-1.5 ${className}`.trim()}>
      {!fitsAll && (
        <button type="button" className="folder-tab-pager" onClick={() => page(-size)} disabled={from === 0} aria-label={pagerLabels[0]}>
          <span aria-hidden="true">‹</span>
        </button>
      )}
      <div role="tablist" aria-label={label} className="flex min-w-0 items-end gap-1.5">
        {shown.map((t, i) => {
          const index = from + i;
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={tabId(t.id)}
              aria-selected={selected}
              aria-controls={panelId}
              aria-busy={busy === t.id || undefined}
              tabIndex={index === stop.index ? 0 : -1}
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={`folder-tab ${selected ? "folder-tab--active" : ""}`.trim()}
            >
              <span className="flex w-full items-center gap-1.5 text-xs font-bold">
                <span className="min-w-0 truncate">{t.label}</span>
                {busy === t.id && <Spinner />}
              </span>
              {t.detail && <span className="block w-full truncate text-[11px] font-medium opacity-80">{t.detail}</span>}
            </button>
          );
        })}
      </div>
      {!fitsAll && (
        <button
          type="button"
          className="folder-tab-pager"
          onClick={() => page(size)}
          disabled={from + size >= tabs.length}
          aria-label={pagerLabels[1]}
        >
          <span aria-hidden="true">›</span>
        </button>
      )}
    </div>
  );
}
