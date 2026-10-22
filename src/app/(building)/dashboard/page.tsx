/**
 * The dashboard, shown as the ledger on the front desk: the user's interviews
 * in volumes (`?page=`), newest first, each with its questions, answer
 * excerpts and notes (lib/frontend/ledger.ts loads them). Without
 * `?open=ledger` the desk is shown and the ledger stays shut, so nothing is
 * fetched.
 */

import { redirect } from "next/navigation";

import { Ledger } from "@/components/desk/Ledger";
import { requireUser } from "@/lib/auth";
import { ledgerVolumeHref, loadLedgerShelf, loadLedgerVolume, VOLUME_SIZE } from "@/lib/frontend/ledger";
import { clampPage, pageCount, rowRange } from "@/lib/frontend/pagination";
import { createClient } from "@/lib/supabase/server";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  const { open, page: pageParam, section, entry } = await searchParams;
  if (one(open) !== "ledger") return null;
  const supabase = await createClient();

  const shelf = await loadLedgerShelf(supabase, user.id);
  const volumes = pageCount(shelf.total, VOLUME_SIZE);
  const volume = clampPage(one(pageParam), volumes);

  // Normalise a volume that no longer exists (e.g. after a delete).
  if (pageParam !== undefined && String(volume) !== String(one(pageParam))) {
    redirect(ledgerVolumeHref(volume));
  }

  const range = rowRange(volume, VOLUME_SIZE);
  const entries = shelf.total ? await loadLedgerVolume(supabase, range) : [];

  return (
    <Ledger
      owner={shelf.owner}
      volume={{ number: volume, count: volumes, offset: range[0], total: shelf.total }}
      entries={entries}
      progress={{
        completed: shelf.completed,
        inProgress: Math.max(0, shelf.total - shelf.completed),
        latestScores: shelf.trend.at(-1)?.scores ?? null,
        latestOverall: shelf.trend.at(-1)?.overall ?? null,
      }}
      trend={shelf.trend}
      // A volume link (?page=) opens at the contents.
      link={{ section: one(section) ?? (pageParam !== undefined ? "history" : undefined), entry: one(entry) }}
    />
  );
}
