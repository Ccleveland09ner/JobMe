/**
 * Landing page. Pitch plus the way in.
 * Ref: docs/PRD-JobMe-MVP.md > Screens and Layout (1)
 *      design/Symmetrical Campus Building in Ink.png
 *
 * Signed-in visitors redirect straight to /dashboard.
 *
 * No header, no footer and, for now, no pitch: the scene fills the window and
 * the call to action is the only way on. The art (<HeroScene>) is decorative
 * and click-through, so the button still works with canvas or images
 * unavailable.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { HeroScene } from "@/components/landing/HeroScene";
import { buttonClasses } from "@/components/ui/Button";
import { getUserOrNull } from "@/lib/auth";

export default async function Home() {
  if (await getUserOrNull()) redirect("/dashboard");

  return (
    <main
      id="main"
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[34rem] flex-1 flex-col overflow-hidden"
    >
      <HeroScene />

      {/*
        Live text rather than part of the artwork: it stays sharp at any size,
        it is the page's heading, and it is the one piece of copy that is not
        waiting on the pitch.

        Written "JobMe" and capitalised in CSS — a screen reader given
        "JOBME" may spell it out letter by letter.
      */}
      <div className="relative z-10 flex w-full flex-col items-center gap-[3vh] px-4 pt-[3vh]">
        <h1
          id="hero-title"
          className="text-center font-bold uppercase leading-none tracking-tight text-ink"
          /**
           * Sized off the sky: the roofline sits 16.4% down the backdrop, so
           * the title is capped against viewport HEIGHT to stay above it, and
           * against width as well so five wide letters still fit a phone.
           */
          style={{ fontSize: "min(25vh, 30vw)" }}
        >
          JobMe
        </h1>

        <Link href="/login" className={buttonClasses({ size: "lg" })}>
          Sign in to start practicing
        </Link>
      </div>
    </main>
  );
}
