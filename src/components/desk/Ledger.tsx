"use client";

/**
 * The dashboard as the ledger on the front desk: spreads (Trends, History,
 * Summary) kept in the URL. Picking an interview opens its report.
 */

import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";

import { HeldBook, Pages } from "@/components/held/Held";

export interface LedgerSection {
  id: string;
  label: string;
  content: ReactNode;
}

export function Ledger({
  kicker,
  sections,
  initialSection,
}: {
  kicker?: ReactNode;
  sections: LedgerSection[];
  initialSection?: string;
}) {
  const router = useRouter();
  const [page, setPage] = useState(() => Math.max(0, sections.findIndex((s) => s.id === initialSection)));
  const close = useCallback(() => router.push("/dashboard"), [router]);

  const turnTo = (to: number) => {
    setPage(to);
    // Keep the spread in the URL without a server round trip.
    const url = new URL(window.location.href);
    url.searchParams.set("section", sections[to].id);
    url.searchParams.delete("page");
    window.history.replaceState(null, "", url);
  };

  return (
    <HeldBook title="Performance record" kicker={kicker} onClose={close}>
      <div className="flex flex-col gap-5">
        {/* Tabs down the page edge, like a ledger's thumb index. */}
        <div role="tablist" aria-label="Ledger sections" className="flex flex-wrap gap-2">
          {sections.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === page}
              onClick={() => turnTo(i)}
              className={`rounded-t-lg border-2 border-b-0 px-4 py-1.5 text-sm font-semibold transition-colors ${
                i === page ? "border-ink bg-brass text-ink" : "border-ink/30 bg-sunken text-muted hover:border-ink/60 hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" aria-label={sections[page].label}>
          <Pages page={page} count={sections.length} onTurn={turnTo} label="Ledger" pageLabel={(i) => sections[i].label}>
            {sections[page].content}
          </Pages>
        </div>
      </div>
    </HeldBook>
  );
}
