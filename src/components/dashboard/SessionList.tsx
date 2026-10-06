"use client";

/**
 * Interview history for the current page, plus delete.
 *
 * Pagination is NOT in here: the dashboard pages on the server by URL
 * (`?page=`), so this list only ever receives one page of rows. Moving to a
 * paged API later changes the page component, not this one.
 *
 * Delete: confirm -> DELETE /api/sessions/[id] -> router.refresh(). No full
 * reload. A 404 counts as success — the row is gone either way.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { LocalDate } from "@/components/common/LocalDate";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { friendlyError } from "@/lib/frontend/adapters";
import type { SessionSummary } from "@/lib/frontend/types";

import { SessionRow } from "./SessionRow";

export function SessionList({ sessions }: { sessions: SessionSummary[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<SessionSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  function close() {
    if (deleting) return;
    setTarget(null);
    setError(null);
  }

  async function confirmDelete() {
    if (!target) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${target.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        setError(friendlyError(res.status, await res.json().catch(() => null)));
        return;
      }
      setTarget(null);
      startRefresh(() => router.refresh());
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ul aria-busy={refreshing} className="flex flex-col gap-3">
        {sessions.map((s) => (
          <SessionRow key={s.id} session={s} onDelete={setTarget} />
        ))}
      </ul>

      <Dialog
        open={target !== null}
        onClose={close}
        title="Delete this interview?"
        description={
          target && (
            <>
              The interview from <LocalDate iso={target.startedAt} format="dateTime" />, its answers and
              its scorecard will be permanently removed.
            </>
          )
        }
        actions={
          <>
            <Button variant="secondary" onClick={close} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete interview"}
            </Button>
          </>
        }
      >
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </Dialog>
    </>
  );
}
