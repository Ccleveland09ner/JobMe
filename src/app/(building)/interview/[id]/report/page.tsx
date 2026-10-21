/**
 * An interview's report, filed in the reports folder with a tab for every
 * finished interview. Without a saved report the folder's sheet writes it
 * once (ReportGenerator). Scores are shown as stored.
 */

import { notFound } from "next/navigation";

import { ReportsFolder } from "@/components/desk/ReportsFolder";
import { requireUser } from "@/lib/auth";
import { loadReportDocument, loadReportIndex, type ReportTab } from "@/lib/frontend/report-document";
import { SessionId } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export default async function ReportPage({ params }: PageProps<"/interview/[id]/report">) {
  const { id } = await params;
  await requireUser();
  if (!SessionId.safeParse(id).success) notFound();

  const supabase = await createClient();
  const [doc, index] = await Promise.all([
    loadReportDocument(supabase, id),
    // Not essential: without it the folder shows just this report's tab.
    loadReportIndex(supabase).catch((): ReportTab[] => []),
  ]);
  if (!doc) notFound();

  return <ReportsFolder initial={doc} index={index} />;
}
