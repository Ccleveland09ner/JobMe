/**
 * Dashboard - home and history. Server Component.
 * Ref: docs/PRD-JobMe-MVP.md > Dashboard and Progress
 *      docs/TechDesign-JobMe-MVP.md > Components > Dashboard
 *
 * Reads interview_sessions via createClient() from lib/supabase/server. RLS
 * scopes the rows to the signed-in user, so no explicit user_id filter is
 * needed - but requireUser() still gates the page.
 *
 * History is paged on the server by `?page=` with a Supabase range, so the
 * page never loads every session at once. The trend chart has its own
 * lightweight query over completed sessions only.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/common/Pagination";
import { DashboardSummary } from "@/components/dashboard/DashboardSummary";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SessionList } from "@/components/dashboard/SessionList";
import { TrendChart, type TrendPoint } from "@/components/dashboard/TrendChart";
import { PageContainer, PageHeader } from "@/components/layout/PageContainer";
import { buttonClasses } from "@/components/ui/Button";
import { requireUser } from "@/lib/auth";
import {
  pickScores,
  sessionSummaryFromRow,
  type SessionRowData,
} from "@/lib/frontend/adapters";
import { clampPage, pageCount, rowRange } from "@/lib/frontend/pagination";
import { createClient } from "@/lib/supabase/server";

/** Sessions per history page. */
const PAGE_SIZE = 8;

/** Completed sessions plotted on the trend chart, most recent. */
const TREND_LIMIT = 20;

const SESSION_COLUMNS =
  "id, status, question_count, overall_scores, started_at, ended_at, mode:engine_state->>mode";

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  await requireUser();
  const { page: pageParam } = await searchParams;
  const supabase = await createClient();

  const [totalRes, trendRes] = await Promise.all([
    supabase.from("interview_sessions").select("id", { count: "exact", head: true }),
    supabase
      .from("interview_sessions")
      .select("id, started_at, overall_scores", { count: "exact" })
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(TREND_LIMIT),
  ]);
  if (totalRes.error) throw new Error(`dashboard count: ${totalRes.error.message}`);
  if (trendRes.error) throw new Error(`dashboard trend: ${trendRes.error.message}`);

  const total = totalRes.count ?? 0;
  const completed = trendRes.count ?? 0;
  const totalPages = pageCount(total, PAGE_SIZE);
  const page = clampPage(Array.isArray(pageParam) ? pageParam[0] : pageParam, totalPages);

  // Normalise the URL when it named a page that no longer exists, e.g. after
  // deleting the only row on the last page.
  if (pageParam !== undefined && String(page) !== String(pageParam)) {
    redirect(page === 1 ? "/dashboard" : `/dashboard?page=${page}`);
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
      Start interview
    </Link>
  );

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Your interviews"
        description="Practice, see what the recruiter noticed, and track how your answers improve."
        actions={total > 0 ? startCta : undefined}
      />

      {total === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-labelledby="history-title" className="flex min-w-0 flex-col gap-4">
            <h2 id="history-title" className="text-base font-semibold text-ink">
              History
            </h2>
            <SessionList sessions={sessions} />
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              totalItems={total}
              label="Interview history pages"
              hrefForPage={(p) => (p === 1 ? "/dashboard" : `/dashboard?page=${p}`)}
            />
          </section>

          <div className="flex min-w-0 flex-col gap-6 lg:row-start-1 lg:col-start-2">
            <DashboardSummary
              completed={completed}
              inProgress={Math.max(0, total - completed)}
              latestScores={trend.at(-1)?.scores ?? null}
            />
            <TrendChart points={trend} />
          </div>
        </div>
      )}
    </PageContainer>
  );
}
