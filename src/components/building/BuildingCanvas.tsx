"use client";

/**
 * The building's single canvas, kept for the whole visit by the (building)
 * layout; the camera decides where the user is. Renders on demand.
 */

import { useGLTF } from "@react-three/drei";
import { Canvas, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";

import { RECRUITER_MODEL, RecruiterModel } from "@/components/room/Recruiter3D";
import type { Look, Speaker } from "@/components/room/types";
import { LETTERING_FONT } from "@/components/three/lettering";
import { OutlineRenderer } from "@/components/three/OutlineRenderer";
import { PALETTE } from "@/components/three/toon";

import { useBuilding } from "./BuildingProvider";
import { CameraRig } from "./CameraRig";
import { Corridor } from "./scene/Corridor";
import { InterviewRoomScene } from "./scene/InterviewRoom";
import { Lobby } from "./scene/Lobby";
import { LOOK_POINTS } from "./scene/Objects";
import { Street } from "./scene/Street";
import type { Station } from "./stations";
import { RECRUITER, SECRETARY } from "./world";

const INSIDE: ReadonlySet<Station> = new Set(["desk", "corridor", "room"]);

/** PLACEHOLDER: the secretary is the recruiter model, recoloured, until secretary.glb exists. */
const SECRETARY_LOOK: Look = {
  colors: { avaturn_look_0_material: "#b4553a", Wolf3D_Hair: "#5a3825" },
  glasses: false,
  // Not staring the whole time.
  idleGlances: true,
};

export default function BuildingCanvas() {
  const building = useBuilding();
  // The secretary glances at whatever the user points at.
  const secretary = useRef<Speaker>({ state: "idle" });
  const hovered = building?.hovered ?? null;
  useEffect(() => {
    secretary.current = { state: "idle", lookAt: hovered ? (LOOK_POINTS[hovered] ?? null) : null };
  }, [hovered]);

  // A pointer over anything the user can use.
  const pointed = useRef(false);
  useEffect(() => {
    if (hovered) document.body.style.cursor = "pointer";
    else if (pointed.current) document.body.style.cursor = "";
    pointed.current = hovered !== null;
  }, [hovered]);
  useEffect(() => () => void (document.body.style.cursor = ""), []);

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
      // Up to 2x: the characters are rendered in full 3D and soften below it.
      dpr={[1, 2]}
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
useLoader.preload(FontLoader, LETTERING_FONT);
