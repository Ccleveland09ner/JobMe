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
import { StreetSounds } from "@/components/building/StreetSounds";
import { ReceptionistBubble } from "@/components/receptionist/ReceptionistBubble";
import { ReceptionistProvider } from "@/components/receptionist/ReceptionistProvider";

export default function BuildingLayout({ children }: { children: ReactNode }) {
  return (
    <BuildingProvider>
      {/* Ms. Crystal, the receptionist: her greetings and goodbyes, and the bubble they show in. */}
      <ReceptionistProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:shadow"
        >
          Skip to content
        </a>
        <BuildingBackdrop />
        <ReceptionistBubble />
        {/* StationLayer reads search params, which needs a Suspense boundary. */}
        <Suspense>
          <StationLayer>{children}</StationLayer>
        </Suspense>
        <Announcer />
        <LobbyMusic />
        <StreetSounds />
        {/* Development only: preview the street's sky at each time of day. */}
        {process.env.NODE_ENV === "development" && <SkyTimeToggle />}
      </ReceptionistProvider>
    </BuildingProvider>
  );
}
