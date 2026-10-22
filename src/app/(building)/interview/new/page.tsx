/**
 * Interview setup: reads the profile name and the latest resume, then renders
 * <SetupForm>. The track is fixed (Behavioral · SWE internship).
 */

import { SetupForm } from "@/components/setup/SetupForm";
import { requireUser } from "@/lib/auth";
import type { ResumeSummary } from "@/lib/frontend/types";
import { createClient } from "@/lib/supabase/server";

export default async function NewInterviewPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [profileRes, resumeRes] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("resumes")
      .select("id, created_at, page_count, coverage_items")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Neither read is essential: fall back to the email name and no resume.
  const profileName = (profileRes.data?.display_name as string | null | undefined)?.trim();
  const defaultName = profileName || user.email?.split("@")[0] || "";

  const resume = resumeRes.data as
    | { id: string; created_at: string; page_count: number | null; coverage_items: unknown }
    | null;
  const latestResume: ResumeSummary | null = resume
    ? {
        id: resume.id,
        createdAt: resume.created_at,
        pageCount: resume.page_count,
        items: Array.isArray(resume.coverage_items)
          ? (resume.coverage_items as { kind: "role" | "project"; label: string }[]).map((i) => ({
              kind: i.kind,
              label: i.label,
            }))
          : [],
      }
    : null;

  return (
    <SetupForm
      title="Before we start"
      description="Behavioral interview · SWE internship. Setup takes under a minute."
      defaultName={defaultName}
      latestResume={latestResume}
    />
  );
}
