"use client";

/**
 * Sign out. With 3D the receptionist says goodbye, then the building walks to
 * the front door and signs out in place (BuildingProvider.leave), so it
 * finishes even if this button is unmounted on the way; without 3D the form
 * just posts /logout.
 */

import { buttonClasses } from "@/components/ui/Button";

import { useBuilding } from "./BuildingProvider";

export function SignOutButton({
  label = "Leave (sign out)",
  variant = "ghost",
}: {
  label?: string;
  variant?: "ghost" | "secondary";
}) {
  const building = useBuilding();
  const leaving = building?.leaving ?? false;

  return (
    <form
      method="post"
      action="/logout"
      onSubmit={(e) => {
        if (!building?.show3D) return;
        e.preventDefault();
        if (!leaving) building.leave();
      }}
    >
      <button type="submit" disabled={leaving} className={buttonClasses({ variant, size: "sm" })}>
        {leaving ? "Leaving…" : label}
      </button>
    </form>
  );
}
