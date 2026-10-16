"use client";

/**
 * The way in from the street: a real link to /login, so it works with no
 * JavaScript and no WebGL. With the 3D building it walks the user up the
 * steps to the door first; the sign-in page arrives as the walk does.
 */

import Link from "next/link";
import type { ReactNode } from "react";

import { useBuilding } from "./BuildingProvider";

export function StepInside({ className, children }: { className?: string; children: ReactNode }) {
  const building = useBuilding();
  return (
    <Link href="/login" className={className} onClick={() => building?.walkTo("entrance")}>
      {children}
    </Link>
  );
}
