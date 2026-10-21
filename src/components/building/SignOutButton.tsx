"use client";

/** Sign out: walk to the front door, then POST /logout. Without 3D it just submits. */

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
