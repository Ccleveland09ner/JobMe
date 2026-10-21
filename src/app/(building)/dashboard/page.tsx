/**
 * The dashboard, shown as the ledger on the front desk. History is paged on
 * the server by `?page=`; RLS scopes rows to the user.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/common/Pagination";
import { DashboardSummary } from "@/components/dashboard/DashboardSummary";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SessionList } from "@/components/dashboard/SessionList";
import { TrendChart, type TrendPoint } from "@/components/dashboard/TrendChart";
import { Ledger, type LedgerSection } from "@/components/desk/Ledger";
import { buttonClasses } from "@/components/ui/Button";
import { requireUser } from "@/lib/auth";
import {
  pickScores,
  sessionSummaryFromRow,
  type SessionRowData,
} from "@/lib/frontend/adapters";
import { clampPage, pageCount, rowRange } from "@/lib/frontend/pagination";
import { createClient } from "@/lib/supabase/server";

/** A history page, with the ledger open on its History spread. */
function historyHref(page: number): string {
  return `/dashboard?open=ledger&section=history${page === 1 ? "" : `&page=${page}`}`;
}

/** Sessions per history page. */
const PAGE_SIZE = 8;

/** Completed sessions plotted on the trend chart, most recent. */
const TREND_LIMIT = 20;

const SESSION_COLUMNS =
  "id, status, question_count, overall_scores, started_at, ended_at, mode:engine_state->>mode";

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  const { page: pageParam, section } = await searchParams;
  const supabase = await createClient();

  const [totalRes, trendRes, profileRes] = await Promise.all([
    supabase.from("interview_sessions").select("id", { count: "exact", head: true }),
    supabase
      .from("interview_sessions")
      .select("id, started_at, overall_scores", { count: "exact" })
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(TREND_LIMIT),
    // Not essential: without it the desk just doesn't show who is signed in.
    supabase.from("profiles").select("username, member_code").eq("id", user.id).maybeSingle(),
  ]);
  const profile = profileRes.error ? null : (profileRes.data as { username: string | null; member_code: string } | null);
  if (totalRes.error) throw new Error(`dashboard count: ${totalRes.error.message}`);
  if (trendRes.error) throw new Error(`dashboard trend: ${trendRes.error.message}`);

  const total = totalRes.count ?? 0;
  const completed = trendRes.count ?? 0;
  const totalPages = pageCount(total, PAGE_SIZE);
  const page = clampPage(Array.isArray(pageParam) ? pageParam[0] : pageParam, totalPages);

  // Normalise a page number that no longer exists (e.g. after a delete).
  if (pageParam !== undefined && String(page) !== String(pageParam)) {
    redirect(historyHref(page));
  }

  const [from, to] = rowRange(page, PAGE_SIZE);
  const { data: rows, error } = total
    ? await supabase
        .from("interview_sessions")
        .select(SESSION_COLUMNS)
        .order("started_at", { ascending: false })
        .range(from, to)
    : { data: [], error: null };
  if (error) throw new Error(`dashboard sessions: ${error.message}`);

  const sessions = ((rows ?? []) as unknown as SessionRowData[]).map(sessionSummaryFromRow);

  const trendRows = (trendRes.data ?? []) as { id: string; started_at: string; overall_scores: unknown }[];
  const trend: TrendPoint[] = trendRows
    .map((r) => ({ id: r.id, startedAt: r.started_at, scores: pickScores(r.overall_scores) }))
    .reverse();

  const startCta = (
    <Link href="/interview/new" className={buttonClasses()}>
      Start an interview
    </Link>
  );

  const kicker = profile ? (
    <>
      {profile.username && <>@{profile.username} · </>}
      <span className="font-mono tracking-wider">{profile.member_code}</span>
    </>
  ) : undefined;

  const sections: LedgerSection[] =
    total === 0
      ? [{ id: "history", label: "History", content: <EmptyState /> }]
      : [
          {
            id: "trends",
            label: "Trends",
            content: (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted">How your scores have moved, interview by interview.</p>
                <TrendChart points={trend} />
              </div>
            ),
          },
          {
            id: "history",
            label: "History",
            content: (
              <section aria-labelledby="history-title" className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="history-title" className="text-base font-semibold text-ink">
                    Every interview
                  </h2>
                  {startCta}
                </div>
                <p className="text-sm text-muted">Open a finished interview to read its report in the reports folder.</p>
                <SessionList sessions={sessions} />
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  totalItems={total}
                  label="Interview history pages"
                  hrefForPage={historyHref}
                />
              </section>
            ),
          },
          {
            id: "summary",
            label: "Summary",
            content: (
              <DashboardSummary
                completed={completed}
                inProgress={Math.max(0, total - completed)}
                latestScores={trend.at(-1)?.scores ?? null}
              />
            ),
          },
        ];

  // A history page link (?page=) lands on the History spread.
  const initialSection = typeof section === "string" ? section : pageParam !== undefined ? "history" : undefined;

  return <Ledger kicker={kicker} sections={sections} initialSection={initialSection} />;
}
