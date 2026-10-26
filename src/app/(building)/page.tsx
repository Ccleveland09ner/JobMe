/** Landing page: outside the building. Signed-in visitors go straight to /dashboard. */

import { redirect } from "next/navigation";

import { StepInside } from "@/components/building/StepInside";
import { buttonClasses } from "@/components/ui/Button";
import { getUserOrNull } from "@/lib/auth";

export default async function Home() {
  if (await getUserOrNull()) redirect("/dashboard");

  return (
    <div className="flex w-full flex-col items-center gap-[3vh] px-4 pt-[4vh]">
      {/* "JobMe", uppercased in CSS: screen readers may spell out "JOBME". */}
      <h1
        className="sky-title text-center font-bold uppercase leading-none tracking-tight text-ink"
        // Stays below the roofline, and fits a phone.
        style={{ fontSize: "min(18vh, 24vw)" }}
      >
        JobMe
      </h1>

      <StepInside className={buttonClasses({ size: "lg" })}>Step inside</StepInside>
    </div>
  );
}
