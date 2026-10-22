import Link from "next/link";
import { redirect } from "next/navigation";

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
      <Link href="/" className="mb-4 inline-block text-sm font-semibold uppercase tracking-widest text-muted hover:text-ink">
        JobMe
      </Link>
      <LoginForm />
    </Clipboard>
  );
}
