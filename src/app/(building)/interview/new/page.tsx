/**
 * Interview setup: reads the profile name and the latest resume, then renders
 * <SetupForm>. The track is fixed (Behavioral · SWE internship).
 */

import { SetupForm } from "@/components/setup/SetupForm";
import { requireUser } from "@/lib/auth";
import { loadSetup } from "@/lib/frontend/setup";
import { createClient } from "@/lib/supabase/server";

export default async function NewInterviewPage() {
  const user = await requireUser();
  const { defaultName, latestResume } = await loadSetup(await createClient(), user);

  return (
    <SetupForm
      title="Before we start"
      description="Behavioral interview · SWE internship. Setup takes under a minute."
      defaultName={defaultName}
      latestResume={latestResume}
    />
  );
}
