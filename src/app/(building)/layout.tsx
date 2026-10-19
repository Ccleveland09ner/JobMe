/**
 * The building: one place the user walks through, instead of a set of pages.
 * Ref: docs/reverse-engineering/implementation-plan.md
 *
 * A layout rather than a component on each page because layouts persist
 * across navigation — the canvas, the camera and the characters live for the
 * whole visit, and each route only says where in the building it is
 * (components/building/stations.ts).
 *
 * The single <main> landmark is StationLayer's; pages render content only.
 */

import { Suspense, type ReactNode } from "react";

import { Announcer } from "@/components/building/Announcer";
import { BuildingBackdrop } from "@/components/building/BuildingBackdrop";
import { BuildingProvider } from "@/components/building/BuildingProvider";
import { StationLayer } from "@/components/building/StationLayer";

export default function BuildingLayout({ children }: { children: ReactNode }) {
  return (
    <BuildingProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>
      <BuildingBackdrop />
      {/* StationLayer reads the query string (?open=ledger), which Next.js
          requires to sit under a Suspense boundary. */}
      <Suspense>
        <StationLayer>{children}</StationLayer>
      </Suspense>
      <Announcer />
    </BuildingProvider>
  );
}
