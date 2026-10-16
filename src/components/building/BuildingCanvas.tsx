"use client";

/**
 * The building, drawn: one canvas for the whole visit, mounted by the
 * (building) layout so it survives every navigation. The street, the lobby,
 * the corridor and the room are all in it at once; the camera decides which
 * one the user is in.
 *
 * Rendered on demand: frames are drawn only while something moves — the
 * camera, a door, or a character who is on screen (each asks for frames
 * only at its own station).
 *
 * Loaded with `ssr: false` by BuildingBackdrop: three.js cannot run on the
 * server.
 */

import { useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useRef } from "react";

import { RECRUITER_MODEL, RecruiterModel, type Look, type Speaker } from "@/components/room/Recruiter3D";
import { OutlineRenderer } from "@/components/three/OutlineRenderer";
import { PALETTE } from "@/components/three/toon";

import { useBuilding } from "./BuildingProvider";
import { CameraRig } from "./CameraRig";
import { Corridor } from "./scene/Corridor";
import { InterviewRoomScene } from "./scene/InterviewRoom";
import { Lobby } from "./scene/Lobby";
import { Street } from "./scene/Street";
import type { Station } from "./stations";
import { RECRUITER, SECRETARY } from "./world";

const INSIDE: ReadonlySet<Station> = new Set(["desk", "corridor", "room"]);

/**
 * PLACEHOLDER: the secretary is the recruiter model, recoloured, until
 * public/models/secretary.glb is built with design/tools (another
 * TalkingHead sample avatar, re-dressed). Swap the model, keep the look.
 */
const SECRETARY_LOOK: Look = {
  colors: { avaturn_look_0_material: "#b4553a", Wolf3D_Hair: "#5a3825" },
  glasses: false,
};

export default function BuildingCanvas() {
  const building = useBuilding();
  // The secretary only ever smiles and watches the user.
  const secretary = useRef<Speaker>({ state: "idle" });
  if (!building) return null;
  const { state, dispatch, speaker } = building;
  const { station, target, holding } = state;

  const frontDoorsOpen = INSIDE.has(station) || (target !== null && INSIDE.has(target));
  const roomDoorOpen = station === "room" || (target === "room" && !holding);

  return (
    <Canvas
      // `flat`: no tone mapping, so the toon tones keep the palette's values.
      flat
      frameloop="demand"
      dpr={[1, 1.5]}
      gl={{ antialias: true }}
      camera={{ near: 0.05, far: 120 }}
      onCreated={({ gl }) => {
        const el = gl.domElement;
        el.addEventListener("webglcontextlost", (e) => {
          e.preventDefault(); // allow the browser to restore it
          dispatch({ type: "CONTEXT_LOST" });
        });
        el.addEventListener("webglcontextrestored", () => dispatch({ type: "CONTEXT_RESTORED" }));
      }}
    >
      <color attach="background" args={[PALETTE.sky]} />
      <hemisphereLight args={[0xffffff, 0xd8d2c8, 1.25]} />
      <directionalLight position={[6, 12, 9]} intensity={1.5} color={0xfff4e6} />

      <Street doorsOpen={frontDoorsOpen} />
      <Lobby />
      <Corridor doorOpen={roomDoorOpen} />
      <InterviewRoomScene speaker={speaker} />

      <Suspense fallback={null}>
        <RecruiterModel
          speaker={secretary}
          look={SECRETARY_LOOK}
          animate={station === "desk" && target === null}
          position={[SECRETARY.x, 0, SECRETARY.z]}
        />
        <RecruiterModel
          speaker={speaker}
          animate={station === "room" && target === null}
          position={[RECRUITER.x, 0, RECRUITER.z]}
        />
      </Suspense>

      <CameraRig />
      <OutlineRenderer />
    </Canvas>
  );
}

useGLTF.preload(RECRUITER_MODEL);
