"use client";

/**
 * The front desk's way out, and the way back to it: what the old header's
 * "Dashboard" and "Sign out" became. Labels say what happens, so they work
 * for anyone who never sees the building.
 *
 * Leaving walks the user back to the front door first, then signs out with
 * the same POST to /logout the header used. Without JavaScript, or without
 * the 3D building, the form simply submits.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { buttonClasses } from "@/components/ui/Button";

import { useBuilding } from "./BuildingProvider";

export function FixtureBar() {
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
    <nav
      aria-label="Building"
      className="fixed left-4 top-4 z-10 flex items-center gap-1 rounded-xl border border-line bg-surface/90 p-1 shadow-sm backdrop-blur-sm"
    >
      <Link href="/dashboard" className={buttonClasses({ variant: "ghost", size: "sm" })}>
        Front desk
      </Link>
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
        <button type="submit" disabled={leaving} className={buttonClasses({ variant: "ghost", size: "sm" })}>
          {leaving ? "Leaving…" : "Leave (sign out)"}
        </button>
      </form>
    </nav>
  );
}
