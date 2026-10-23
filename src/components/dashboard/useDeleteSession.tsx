"use client";

/**
 * Deleting an interview, behind a confirmation; the page is then refreshed
 * from the server. A 404 counts as success: the row is gone either way.
 * `onDeleted` runs once the dialog has closed, so it can place focus: the
 * button that opened the dialog is about to disappear.
 */

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { LocalDate } from "@/components/common/LocalDate";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { deleteSession, OFFLINE_MESSAGE } from "@/lib/frontend/api";
import type { SessionSummary } from "@/lib/frontend/types";

export function useDeleteSession(onDeleted?: () => void) {
  const router = useRouter();
  const [target, setTarget] = useState<SessionSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  // A delete went through; the dialog's close then calls onDeleted.
  const deleted = useRef(false);

  function close() {
    if (deleting) return;
    setTarget(null);
    setError(null);
    if (deleted.current) {
      deleted.current = false;
      onDeleted?.();
    }
  }

  async function confirmDelete() {
    if (!target || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteSession(target.id);
      // A 404 is a success: the row is gone either way.
      if (!result.ok && (result.offline || result.status !== 404)) {
        setError(result.offline ? OFFLINE_MESSAGE : result.message);
        return;
      }
      deleted.current = true;
      setTarget(null);
      startRefresh(() => router.refresh());
    } catch {
      setError(OFFLINE_MESSAGE);
    } finally {
      setDeleting(false);
    }
  }

  const dialog = (
    <Dialog
      open={target !== null}
      onClose={close}
      dismissable={!deleting}
      title="Delete this interview?"
      description={
        target && (
          <>
            The interview from <LocalDate iso={target.startedAt} format="dateTime" />, its answers and its
            scorecard will be permanently removed.
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
  );

  return { request: setTarget, refreshing, dialog };
}
