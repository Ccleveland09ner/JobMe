/**
 * The building. A layout so the canvas, camera and characters persist across
 * navigation; each route only says where in the building it is (stations.ts).
 */

import { Suspense, type ReactNode } from "react";

import { Announcer } from "@/components/building/Announcer";
import { BuildingBackdrop } from "@/components/building/BuildingBackdrop";
import { BuildingProvider } from "@/components/building/BuildingProvider";
import { LobbyMusic } from "@/components/building/LobbyMusic";
import { SkyTimeToggle } from "@/components/building/sky/SkyTimeToggle";
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
      {/* StationLayer reads search params, which needs a Suspense boundary. */}
      <Suspense>
        <StationLayer>{children}</StationLayer>
      </Suspense>
      <Announcer />
      <LobbyMusic />
      {/* Development only: preview the street's sky at each time of day. */}
      {process.env.NODE_ENV === "development" && <SkyTimeToggle />}
    </BuildingProvider>
  );
}
