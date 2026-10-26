"use client";

/**
 * The building's single canvas, kept for the whole visit by the (building)
 * layout; the camera decides where the user is. Renders on demand.
 */

import { useGLTF } from "@react-three/drei";
import { Canvas, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import { NeutralToneMapping } from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";

import { BubbleAnchor } from "@/components/receptionist/BubbleAnchor";
import { RECEPTIONIST_LOOK } from "@/components/receptionist/look";
import { useReceptionist } from "@/components/receptionist/ReceptionistProvider";
import { RECRUITER_MODEL, RecruiterModel } from "@/components/room/Recruiter3D";
import type { Speaker } from "@/components/room/types";
import { LETTERING_FONT } from "@/components/three/lettering";

import { useBuilding } from "./BuildingProvider";
import { CameraRig } from "./CameraRig";
import { LANDING_ACTIONS } from "./landing/layout";
import { LandingScene } from "./landing/LandingScene";
import { Corridor } from "./scene/Corridor";
import { InterviewRoomScene } from "./scene/InterviewRoom";
import { Lighting } from "./scene/Lighting";
import { Lobby } from "./scene/Lobby";
import { LOOK_POINTS } from "./scene/Objects";
import { Street } from "./scene/Street";
import { MouseParallax } from "./sky/MouseParallax";
import { Sky } from "./sky/Sky";
import type { Station } from "./stations";
import { RECRUITER, SECRETARY } from "./world";

const INSIDE: ReadonlySet<Station> = new Set(["desk", "corridor", "room"]);

/** Neutral tone mapping keeps the palette as it is and only softens highlights. */
const GL = { antialias: true, toneMapping: NeutralToneMapping } as const;

export default function BuildingCanvas() {
  const building = useBuilding();
  // Ms. Crystal's face: her controller drives her speaking; she glances at whatever the user points at.
  const receptionist = useReceptionist();
  const fallbackSpeaker = useRef<Speaker>({ state: "idle" });
  const secretary = receptionist?.speaker ?? fallbackSpeaker;
  const hovered = building?.hovered ?? null;
  useEffect(() => {
    secretary.current = { ...secretary.current, lookAt: hovered ? (LOOK_POINTS[hovered] ?? null) : null };
  }, [hovered, secretary]);
  const talking = (receptionist?.dialogue.phase ?? "idle") !== "idle";

  // A pointer over anything the user can use.
  const pointed = useRef(false);
  useEffect(() => {
    if (hovered) document.body.style.cursor = "pointer";
    else if (pointed.current) document.body.style.cursor = "";
    pointed.current = hovered !== null;
  }, [hovered]);
  useEffect(() => () => void (document.body.style.cursor = ""), []);

  if (!building) return null;
  const { state, dispatch, speaker, held } = building;
  const { station, target, holding } = state;

  const frontDoorsOpen = INSIDE.has(station) || (target !== null && INSIDE.has(target));
  const roomDoorOpen = station === "room" || (target === "room" && !holding);

  return (
    <Canvas
      gl={GL}
      // Soft PCF shadows from the key light (scene/Lighting.tsx).
      shadows="percentage"
      frameloop="demand"
      // A click that hit nothing usable: an open signpost closes (landing/LandingControls.tsx).
      onPointerMissed={() => building.activate(LANDING_ACTIONS.outside)}
      // Up to 2x: the characters are rendered in full 3D and soften below it.
      dpr={[1, 2]}
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
      {/* The sky by the visitor's time of day, and fog in its horizon's colour. */}
      <Sky />
      <Lighting />

      <Street doorsOpen={frontDoorsOpen} />
      <LandingScene />
      <Lobby />
      <Corridor doorOpen={roomDoorOpen} />
      <InterviewRoomScene speaker={speaker} />

      <Suspense fallback={null}>
        <RecruiterModel
          speaker={secretary}
          look={RECEPTIONIST_LOOK}
          // Still while the user reads something from the desk (the scene can rest), unless she is talking.
          animate={station === "desk" && target === null && (held.phase !== "open" || talking)}
          position={[SECRETARY.x, 0, SECRETARY.z]}
          onReady={receptionist?.setReady}
        />
        <RecruiterModel
          speaker={speaker}
          animate={station === "room" && target === null}
          position={[RECRUITER.x, 0, RECRUITER.z]}
        />
      </Suspense>

      <CameraRig />
      <MouseParallax />
      <BubbleAnchor />
    </Canvas>
  );
}

useGLTF.preload(RECRUITER_MODEL);
useLoader.preload(FontLoader, LETTERING_FONT);
