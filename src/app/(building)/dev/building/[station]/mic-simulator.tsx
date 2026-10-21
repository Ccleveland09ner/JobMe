"use client";

/** Dev only: drive the room's mic (panel button and 3D desk mic) without an interview. */

import { useEffect, useMemo, useState } from "react";

import { useBuilding } from "@/components/building/BuildingProvider";
import type { MicControl, MicState, RecruiterState } from "@/components/room/Recruiter3D";
import { TableMic } from "@/components/room/TableMic";
import { Button } from "@/components/ui/Button";

type Phase = "speaking" | "ready" | "recording";

const RECRUITER: Record<Phase, RecruiterState> = { speaking: "speaking", ready: "idle", recording: "listening" };
const MIC: Record<Phase, Exclude<MicState, "off">> = { speaking: "disabled", ready: "ready", recording: "recording" };

export function MicSimulator() {
  const building = useBuilding();
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
      <TableMic state={mic.state as Exclude<MicState, "off">} onToggle={mic.toggle} />
      <p className="text-xs text-muted">Press this mic or the one on the 3D desk. They are the same control.</p>
    </section>
  );
}
