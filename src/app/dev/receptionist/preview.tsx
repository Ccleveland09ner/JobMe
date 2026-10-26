"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

import { RECEPTIONIST_LOOK } from "@/components/receptionist/look";
import { RecruiterModel } from "@/components/room/Recruiter3D";
import type { Speaker } from "@/components/room/types";

/** Each figure's turn from facing the camera, and who it is. */
const ROW: { turn: number; receptionist: boolean }[] = [
  { turn: 0, receptionist: true },
  { turn: 0.6, receptionist: true },
  { turn: Math.PI / 2, receptionist: true },
  { turn: Math.PI, receptionist: true },
  { turn: 0, receptionist: false },
];
const SPACING = 0.62;

/** Seated, the faces are about this high (m). */
const FACE_Y = 1.13;

/** Aims the camera at the faces: the row, or one close up. */
function FrameHeads({ close, high }: { close: boolean; high: boolean }) {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    // "high": from above, as the front desk sees her.
    if (close) camera.position.set(0, FACE_Y + (high ? 0.42 : 0.08), high ? 1.05 : 0.95);
    else camera.position.set(0, FACE_Y + 0.2, 3.1);
    camera.lookAt(0, FACE_Y + (close ? 0.04 : 0), 0);
  });
  return null;
}

function Figure({ x, turn, receptionist }: { x: number; turn: number; receptionist: boolean }) {
  // Looking straight ahead of itself, so each side is seen as it is.
  const speaker = useRef<Speaker>({ state: "idle", lookAt: [x + Math.sin(turn) * 4, 1.15, Math.cos(turn) * 4] });
  return (
    <RecruiterModel
      speaker={speaker}
      look={receptionist ? RECEPTIONIST_LOOK : undefined}
      position={[x, 0, 0]}
      rotation={[0, turn, 0]}
    />
  );
}

export function ReceptionistPreview({ close, high, turn }: { close: boolean; high: boolean; turn: number }) {
  const figures = useMemo(
    () => (close ? [{ turn, receptionist: true }] : ROW).map((f, i, all) => ({ ...f, x: (i - (all.length - 1) / 2) * SPACING })),
    [close, turn],
  );
  return (
    <div className="h-[34rem] w-full overflow-hidden rounded-xl border border-line bg-[#efe6da]">
      <Canvas gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }} dpr={[1, 2]} camera={{ fov: close ? 26 : 30, near: 0.05, far: 50 }}>
        <color attach="background" args={["#efe6da"]} />
        <hemisphereLight args={["#fff8ee", "#c9a98a", 0.9]} />
        <directionalLight position={[9, 10, 5]} color="#fff1df" intensity={2.8} />
        <directionalLight position={[-6, 3, 5]} color="#edf1f7" intensity={1.0} />
        <Suspense fallback={null}>
          {figures.map((f) => (
            <Figure key={`${f.x}:${f.turn}:${f.receptionist}`} {...f} />
          ))}
        </Suspense>
        <FrameHeads close={close} high={high} />
      </Canvas>
    </div>
  );
}
