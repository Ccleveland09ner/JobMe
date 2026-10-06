import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

/**
 * Sign-in shell. The OTP flow itself lives in login-form.tsx and is the
 * starter's, unchanged; only this frame is styled to the JobMe tokens.
 * TODO(visual pass): the form's own zinc classes -> tokens.
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
    <main id="main" className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <Link href="/" className="text-lg font-semibold tracking-tight text-ink">
        JobMe
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6">
        <h1 className="mb-1 text-xl font-semibold text-ink">Sign in</h1>
        <p className="mb-4 text-sm text-muted">We&rsquo;ll email you a 6-digit code. No password needed.</p>
        <LoginForm />
      </div>
    </main>
  );
}
