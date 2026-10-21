"use client";

/**
 * The reports folder: every scorecard as a stack of sheets. The top sheet is
 * the report at the URL; turning a sheet navigates to the neighbouring report.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, type ReactNode } from "react";

import { HeldFolder } from "@/components/held/Held";
import { buttonClasses } from "@/components/ui/Button";

export interface FolderNeighbours {
  newer: string | null;
  older: string | null;
  /** 1-based position from the top of the stack, and the stack's size. */
  position: number;
  total: number;
}

export function ReportsFolder({
  sessionId,
  title,
  kicker,
  neighbours,
  children,
}: {
  /** Null for an empty folder. */
  sessionId: string | null;
  title: string;
  kicker?: ReactNode;
  neighbours?: FolderNeighbours;
  children: ReactNode;
}) {
  const router = useRouter();
  const turn = useSearchParams().get("turn");
  const close = useCallback(() => router.push("/dashboard"), [router]);
  const href = (id: string, direction: "newer" | "older") => `/interview/${id}/report?turn=${direction}`;

  return (
    <HeldFolder title={title} kicker={kicker} onClose={close}>
      <div className="flex flex-col gap-6">
        <div key={sessionId ?? "empty"} className={turn === "newer" ? "page-prev" : turn === "older" ? "page-next" : ""}>
          {children}
        </div>

        {neighbours && neighbours.total > 1 && (
          <nav aria-label="Reports in the folder" className="flex items-center justify-between gap-3 border-t-2 border-ink/80 pt-4">
            {neighbours.newer ? (
              <Link href={href(neighbours.newer, "newer")} className={buttonClasses({ variant: "ghost", size: "sm" })}>
                <span aria-hidden="true">←</span> Newer report
              </Link>
            ) : (
              <span />
            )}
            <span className="text-xs text-muted tabular-nums">
              Report {neighbours.position} of {neighbours.total}
            </span>
            {neighbours.older ? (
              <Link href={href(neighbours.older, "older")} className={buttonClasses({ variant: "ghost", size: "sm" })}>
                Older report <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>
    </HeldFolder>
  );
}
