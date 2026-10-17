/**
 * Development only: stand at any station in the building without signing in,
 * to review the scene and its characters. 404 in production.
 *
 *   /dev/building/street | entrance | desk | corridor | room
 *
 * stationForPath (components/building/stations.ts) maps these paths; this
 * page only supplies the panel's heading.
 */

import { notFound } from "next/navigation";

import { STATION_LABEL, type Station } from "@/components/building/stations";

export default async function DevStationPage({ params }: PageProps<"/dev/building/[station]">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { station } = await params;
  if (!(station in STATION_LABEL)) notFound();

  return (
    <div className="flex flex-col gap-2 p-6">
      <h1 className="text-xl font-semibold text-ink">{STATION_LABEL[station as Station]}</h1>
      <p className="text-sm text-muted">Development viewer. Nothing here is saved.</p>
    </div>
  );
}
