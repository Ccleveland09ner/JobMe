"use client";

import { useState } from "react";

import { RecruiterStage, type RecruiterState } from "@/components/room/RecruiterStage";
import { Button } from "@/components/ui/Button";

const STATES: RecruiterState[] = ["speaking", "idle", "listening", "thinking"];

export function RecruiterPreview({ initial }: { initial: RecruiterState }) {
  const [state, setState] = useState<RecruiterState>(initial);

  return (
    <div className="flex flex-col gap-6">
      <div role="radiogroup" aria-label="Recruiter state" className="flex flex-wrap gap-2">
        {STATES.map((s) => (
          <Button
            key={s}
            role="radio"
            aria-checked={state === s}
            variant={state === s ? "primary" : "secondary"}
            size="sm"
            onClick={() => setState(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface p-6">
          <h2 className="self-start text-sm font-semibold text-muted">3D recruiter</h2>
          <RecruiterStage state={state} />
        </section>
        <section className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface p-6">
          <h2 className="self-start text-sm font-semibold text-muted">Fallback still (no WebGL, loading, errors)</h2>
          <RecruiterStage state={state} forceStill />
        </section>
      </div>
    </div>
  );
}
