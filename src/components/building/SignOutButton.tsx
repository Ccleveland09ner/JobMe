"use client";

/**
 * Leaving the building: walk back to the front door first, then sign out
 * with a POST to /logout. Without JavaScript, or without the 3D building, the
 * form simply submits. Lives on the settings board's Account note.
 */

import { useEffect, useRef, useState } from "react";

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
  const form = useRef<HTMLFormElement>(null);
  const [leaving, setLeaving] = useState(false);

  // Submit once the walk to the door has arrived.
  useEffect(() => {
    if (leaving && building?.state.station === "entrance" && building.state.target === null) {
      form.current?.submit();
    }
  }, [leaving, building?.state.station, building?.state.target]);

  return (
    <form
      ref={form}
      method="post"
      action="/logout"
      onSubmit={(e) => {
        if (!building?.show3D || leaving) return;
        e.preventDefault();
        setLeaving(true);
        building.walkTo("entrance");
      }}
    >
      <button type="submit" disabled={leaving} className={buttonClasses({ variant, size: "sm" })}>
        {leaving ? "Leaving…" : label}
      </button>
    </form>
  );
}
