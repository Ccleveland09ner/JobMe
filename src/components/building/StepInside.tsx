"use client";

/** The way in: a real link to /login; with the 3D building it walks to the door first. */

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
