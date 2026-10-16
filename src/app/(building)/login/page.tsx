import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { Clipboard } from "@/components/ui/Clipboard";

import { LoginForm } from "./login-form";

/**
 * Sign-in, at the front door: the panel beside the door in the building.
 * The OTP flow itself lives in login-form.tsx and is the
 * starter's, logic unchanged; the form's classes were moved to the JobMe
 * tokens because its dark: variants clashed with the light-only palette.
 */
export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <Link href="/" className="text-lg font-semibold tracking-tight text-ink">
        JobMe
      </Link>
      <Clipboard className="mt-3">
        <h1 className="mb-1 text-xl font-semibold text-ink">Sign in</h1>
        <p className="mb-5 text-sm text-muted">We&rsquo;ll email you a 6-digit code. No password needed.</p>
        <LoginForm />
      </Clipboard>
    </div>
  );
}
