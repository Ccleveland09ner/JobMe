"use client";

/** The title and tagline: they fade away while a poster is up close, so nothing overlaps it. */

import type { ReactNode } from "react";

import { useBuilding } from "../BuildingProvider";
import { isPoster } from "./layout";

export function HeroFade({ className, children }: { className?: string; children: ReactNode }) {
  const building = useBuilding();
  const away = isPoster(building?.focus ?? null);
  return <div className={`${className ?? ""} transition-opacity duration-500 ${away ? "opacity-0" : "opacity-100"}`}>{children}</div>;
}
