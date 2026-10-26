"use client";

/**
 * The ways in and out of the building: real links (to /login, and back to the
 * street at /); with the 3D building, the camera walks there first.
 */

import Link from "next/link";
import type { DOMAttributes, ReactNode } from "react";

import { useBuilding } from "./BuildingProvider";

/** Focus handlers, for a link that lights its 3D twin while focused. */
type FocusEventHandlers = DOMAttributes<HTMLAnchorElement>;

export function StepInside({
  className,
  children,
  onFocus,
  onBlur,
}: { className?: string; children: ReactNode } & Pick<FocusEventHandlers, "onFocus" | "onBlur">) {
  const building = useBuilding();
  return (
    <Link href="/login" className={className} onClick={() => building?.walkTo("entrance")} onFocus={onFocus} onBlur={onBlur}>
      {children}
    </Link>
  );
}

export function StepOutside({ className, children }: { className?: string; children: ReactNode }) {
  const building = useBuilding();
  return (
    <Link href="/" className={className} onClick={() => building?.walkTo("street")}>
      {children}
    </Link>
  );
}
