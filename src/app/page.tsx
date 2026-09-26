/**
 * Landing page. Pitch plus the way in.
 *
 * TODO(slice 1): build out the 3-step "how it works" and the real hero.
 * Ref: docs/PRD-JobMe-MVP.md > Screens and Layout (1)
 *
 * Signed-in visitors redirect straight to /dashboard.
 *
 * Replaced the starter's todos demo page. The todos migration is still in
 * supabase/migrations/ - see README > Before you start slice 1.
 */

import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-4">
        <h1 className="text-4xl font-semibold tracking-tight text-ink">
          A mock interview where the recruiter actually listens.
        </h1>
        <p className="text-lg text-muted">
          Every follow-up targets the weakest part of your last answer, and a
          live recruiter&rsquo;s notepad shows you why.
        </p>
      </div>

      {/* TODO(slice 1): 3-step "how it works" strip */}

      <div>
        <Link
          href="/login"
          className="inline-flex rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
