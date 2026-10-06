/**
 * Header for signed-in screens. Sign out is a POST form to the existing
 * /logout route — it works without JavaScript and is not prefetched the way
 * a GET link would be.
 */

import Link from "next/link";

import { buttonClasses } from "@/components/ui/Button";

export function AppHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-ink">
          JobMe
        </Link>
        <nav aria-label="Account" className="flex items-center gap-1">
          <Link href="/dashboard" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            Dashboard
          </Link>
          <form method="post" action="/logout">
            <button type="submit" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
