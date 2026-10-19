/**
 * The reports folder, picked up from the desk without a particular report in
 * mind: open it at the newest scorecard, or show an empty folder.
 * Server Component.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { ReportsFolder } from "@/components/desk/ReportsFolder";
import { buttonClasses } from "@/components/ui/Button";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ReportsPage() {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interview_sessions")
    .select("id")
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`reports: ${error.message}`);
  if (data) redirect(`/interview/${(data as { id: string }).id}/report`);

  return (
    <ReportsFolder sessionId={null} title="Interview reports">
      <div className="flex flex-col items-start gap-4 py-6">
        <p className="text-base text-ink">The folder is empty.</p>
        <p className="text-sm text-muted">Finish an interview and its report will be filed here.</p>
        <Link href="/interview/new" className={buttonClasses()}>
          Start an interview
        </Link>
      </div>
    </ReportsFolder>
  );
}
