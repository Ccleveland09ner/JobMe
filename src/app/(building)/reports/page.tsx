/** The reports folder without a chosen report: open at the newest, or empty. */

import { redirect } from "next/navigation";

import { ReportsFolder } from "@/components/desk/ReportsFolder";
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

  return <ReportsFolder initial={null} index={[]} />;
}
