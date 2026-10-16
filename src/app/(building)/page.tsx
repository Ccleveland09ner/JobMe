/**
 * Landing page: outside the building. The title and the way in.
 * Ref: docs/PRD-JobMe-MVP.md > Screens and Layout (1)
 *      docs/reverse-engineering/interaction-flow.md > 0. Outside
 *
 * Signed-in visitors redirect straight to /dashboard.
 *
 * The street itself is the building layout's backdrop (3D, or the ink
 * campus drawing without WebGL). It is decorative; the button works with
 * neither.
 */

import { redirect } from "next/navigation";

import { StepInside } from "@/components/building/StepInside";
import { buttonClasses } from "@/components/ui/Button";
import { getUserOrNull } from "@/lib/auth";

export default async function Home() {
  if (await getUserOrNull()) redirect("/dashboard");

  return (
    <div className="flex w-full flex-col items-center gap-[3vh] px-4 pt-[4vh]">
      {/*
        Live text rather than part of the scene: it stays sharp at any size,
        it is the page's heading, and it reads the same over the 3D street
        and the illustrated one.

        Written "JobMe" and capitalised in CSS — a screen reader given
        "JOBME" may spell it out letter by letter.
      */}
      <h1
        className="text-center font-bold uppercase leading-none tracking-tight text-ink"
        // Capped against height to stay above the roofline, and against
        // width so five wide letters still fit a phone.
        style={{ fontSize: "min(18vh, 24vw)" }}
      >
        JobMe
      </h1>

      <StepInside className={buttonClasses({ size: "lg" })}>Step inside</StepInside>
    </div>
  );
}
