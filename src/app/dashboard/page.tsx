/**
 * Dashboard - home and history. Server Component.
 *
 * TODO(slice 1): shell + empty state. TODO(slice 6): list, trends, delete.
 * Ref: docs/PRD-JobMe-MVP.md > Dashboard and Progress
 *      docs/TechDesign-JobMe-MVP.md > Components > Dashboard
 *
 * Reads interview_sessions via createClient() from lib/supabase/server. RLS
 * scopes the rows to the signed-in user, so no explicit user_id filter is
 * needed - but requireUser() still gates the page.
 *
 * Completed sessions newest first. In-progress ones show Resume.
 * The trend chart needs >= 2 completed sessions; below that, a placeholder.
 */

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Your interviews
      </h1>
      {/* TODO(slice 1): <EmptyState /> - "Your first interview takes about 8 minutes" */}
      {/* TODO(slice 6): <TrendChart />, <SessionRow /> list */}
    </main>
  );
}
