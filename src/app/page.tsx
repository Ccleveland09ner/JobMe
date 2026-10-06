/**
 * Landing page. Pitch plus the way in.
 * Ref: docs/PRD-JobMe-MVP.md > Screens and Layout (1)
 *
 * Signed-in visitors redirect straight to /dashboard.
 *
 * TODO(visual pass): hero illustration from design/Landing page.png.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/PageContainer";
import { buttonClasses } from "@/components/ui/Button";
import { getUserOrNull } from "@/lib/auth";

const STEPS = [
  {
    title: "Set up in under a minute",
    body: "Pick a quick practice round or a full interview built from your resume, and add the job you're aiming for.",
  },
  {
    title: "Answer out loud",
    body: "A recruiter asks behavioral questions and follows up on the weakest part of each answer, the way a real screen does.",
  },
  {
    title: "See exactly what to fix",
    body: "The recruiter's notepad shows what was noticed and why each question was asked. Your scorecard ends with a rewrite of your weakest answer.",
  },
];

export default async function Home() {
  if (await getUserOrNull()) redirect("/dashboard");

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="text-lg font-semibold tracking-tight text-ink">JobMe</span>
          <Link href="/login" className={buttonClasses({ variant: "secondary", size: "sm" })}>
            Sign in
          </Link>
        </div>
      </header>

      <main id="main" className="flex flex-1 flex-col">
        <PageContainer width="wide" className="flex flex-col gap-16 py-16 sm:py-24">
          <section aria-labelledby="hero-title" className="flex max-w-2xl flex-col gap-6">
            <h1 id="hero-title" className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              A mock interview where the recruiter actually listens.
            </h1>
            <p className="text-lg text-muted">
              Every follow-up targets the weakest part of your last answer, and a
              live recruiter&rsquo;s notepad shows you why.
            </p>
            <div>
              <Link href="/login" className={buttonClasses({ size: "lg" })}>
                Sign in to start practicing
              </Link>
            </div>
          </section>

          <section aria-labelledby="how-title" className="flex flex-col gap-6">
            <h2 id="how-title" className="text-xl font-semibold text-ink">
              How it works
            </h2>
            <ol className="grid gap-4 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5">
                  <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong">
                    {i + 1}
                  </span>
                  <h3 className="font-semibold text-ink">{step.title}</h3>
                  <p className="text-sm text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </section>
        </PageContainer>
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted sm:px-6">
          Practice feedback only. Scores are not a prediction of any hiring outcome.
        </p>
      </footer>
    </>
  );
}
