/** The reports folder without a chosen report: open at the newest, or empty. */

import { redirect } from "next/navigation";

import { ReportsFolder } from "@/components/desk/ReportsFolder";
import { requireUser } from "@/lib/auth";
import { latestFiledReportId } from "@/lib/frontend/report-document";
import { createClient } from "@/lib/supabase/server";

export default async function ReportsPage() {
  await requireUser();
  const latest = await latestFiledReportId(await createClient());
  if (latest) redirect(`/interview/${latest}/report`);

  return <ReportsFolder initial={null} index={[]} />;
}
