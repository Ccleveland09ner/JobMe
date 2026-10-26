import { redirect } from "next/navigation";

import { StepOutside } from "@/components/building/StepInside";
import { Clipboard } from "@/components/ui/Clipboard";
import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

/** Sign in or create an account, on the clipboard at the front door. */
export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <Clipboard>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted">JobMe</p>
        {/* The way back out, to the street in front of the building. */}
        <StepOutside className="text-sm font-semibold text-muted underline-offset-4 hover:text-ink hover:underline">
          <span aria-hidden="true">←</span> Back outside
        </StepOutside>
      </div>
      <LoginForm />
    </Clipboard>
  );
}
