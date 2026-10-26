/**
 * Interviews deleted in this browser tab. Back and Forward bring a page back
 * as the router kept it, printed before the delete, so a ledger or a reports
 * folder could still show an interview that is gone: both leave out what is
 * listed here. Written only in the browser, once a delete has gone through;
 * a reload starts it empty, when the server's rows are current again.
 */

import { useSyncExternalStore } from "react";

const NONE: ReadonlySet<string> = new Set();

let deleted: ReadonlySet<string> = NONE;
const listeners = new Set<() => void>();

/** Records a delete for every page reading the list. */
export function markDeleted(id: string): void {
  if (deleted.has(id)) return;
  deleted = new Set(deleted).add(id);
  for (const listener of listeners) listener();
}

/** The interviews deleted so far: a new set after each delete, so React can compare it. */
export function deletedInterviews(): ReadonlySet<string> {
  return deleted;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The same, as React state; none on the server and through hydration. */
export function useDeletedInterviews(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, deletedInterviews, () => NONE);
}
