/** Landing page: outside the building. Signed-in visitors go straight to /dashboard. */

import { redirect } from "next/navigation";

import { HeroFade } from "@/components/building/landing/HeroFade";
import { LandingControls } from "@/components/building/landing/LandingControls";
import { Tagline } from "@/components/building/landing/Tagline";
import { getUserOrNull } from "@/lib/auth";

export default async function Home() {
  if (await getUserOrNull()) redirect("/dashboard");

  return (
    <>
      {/* Only the title and tagline: the way in and the posters are in the scene (landing/). */}
      <HeroFade className="flex w-full flex-col items-center gap-[1.5vh] px-4 pt-[4vh]">
        {/* "JobMe", uppercased in CSS: screen readers may spell out "JOBME". */}
        <h1
          className="sky-title text-center font-bold uppercase leading-none tracking-tight text-ink"
          // Stays below the roofline, and fits a phone.
          style={{ fontSize: "min(18vh, 24vw)" }}
        >
          JobMe
        </h1>
        <Tagline />
      </HeroFade>
      <LandingControls />
    </>
  );
}
