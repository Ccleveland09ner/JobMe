import Link from "next/link";
import { redirect } from "next/navigation";

import { Clipboard } from "@/components/ui/Clipboard";
import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

/**
 * Sign in or create an account, at the front door: the clipboard beside the
 * door in the building. Email and password; see login-form.tsx.
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
        <LoginForm />
      </Clipboard>
    </div>
  );
}
