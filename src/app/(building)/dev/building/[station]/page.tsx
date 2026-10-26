/** Dev only: stand at any station without signing in (/dev/building/<station>). 404 in production. */

import { notFound } from "next/navigation";

import { SignOutButton } from "@/components/building/SignOutButton";
import { STATION_LABEL, type Station } from "@/components/building/stations";

import { MicSimulator } from "./mic-simulator";

export default async function DevStationPage({ params }: PageProps<"/dev/building/[station]">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { station } = await params;
  if (!(station in STATION_LABEL)) notFound();

  return (
    <div className="flex flex-col gap-2 p-6">
      <h1 className="text-xl font-semibold text-ink">{STATION_LABEL[station as Station]}</h1>
      <p className="text-sm text-muted">Development viewer. Nothing here is saved.</p>
      {station === "room" && <MicSimulator />}
      {/* The receptionist's goodbye, then the real sign-out (signed out already, it just lands on /login). */}
      {(station === "desk" || station === "noteboard") && (
        <div>
          <SignOutButton label="Sign out (hear the goodbye)" variant="secondary" />
        </div>
      )}
    </div>
  );
}
