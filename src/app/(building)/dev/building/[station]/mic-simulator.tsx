"use client";

/** Dev only: drive the room's mic without an interview: the 3D desk mic, or this panel's without 3D. */

import { useEffect, useMemo, useState } from "react";

import { useBuilding, useShow3D } from "@/components/building/BuildingProvider";
import { PinnedMic } from "@/components/room/PinnedMic";
import type { MicControl, MicState, RecruiterState } from "@/components/room/types";
import { TableMic } from "@/components/room/TableMic";
import { Button } from "@/components/ui/Button";

type Phase = "speaking" | "ready" | "recording";

const RECRUITER: Record<Phase, RecruiterState> = { speaking: "speaking", ready: "idle", recording: "listening" };
const MIC: Record<Phase, Exclude<MicState, "off">> = { speaking: "disabled", ready: "ready", recording: "recording" };

export function MicSimulator() {
  const building = useBuilding();
  const show3D = useShow3D();
  const setSpeaker = building?.setSpeaker;
  const [phase, setPhase] = useState<Phase>("speaking");

  const mic = useMemo<MicControl>(
    () => ({
      state: MIC[phase],
      toggle: () => setPhase((p) => (p === "ready" ? "recording" : p === "recording" ? "ready" : p)),
    }),
    [phase],
  );

  useEffect(() => {
    setSpeaker?.({ state: RECRUITER[phase], mic });
  }, [setSpeaker, phase, mic]);
  useEffect(() => () => setSpeaker?.({ state: "idle" }), [setSpeaker]);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line p-4">
      <h2 className="text-sm font-semibold text-ink">Mic simulator</h2>
      <div className="flex flex-wrap gap-2">
        {(["speaking", "ready", "recording"] as const).map((p) => (
          <Button key={p} size="sm" variant={phase === p ? "primary" : "secondary"} onClick={() => setPhase(p)}>
            {p === "speaking" ? "Interviewer speaking" : p === "ready" ? "Your turn" : "Recording"}
          </Button>
        ))}
      </div>
      {/* As in the room: the 3D desk mic is the only mic, or this one without 3D. */}
      {show3D && <PinnedMic state={mic.state as Exclude<MicState, "off">} onToggle={mic.toggle} />}
      {show3D === false && <TableMic state={mic.state as Exclude<MicState, "off">} onToggle={mic.toggle} />}
      <p className="text-xs text-muted">Press the mic on the 3D table (or Tab to it).</p>
    </section>
  );
}
