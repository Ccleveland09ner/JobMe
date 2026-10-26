"use client";

/**
 * The sky over the street, by the visitor's time of day: a gradient dome,
 * stars and moon around the camera, drifting clouds, and fog in the horizon's
 * colour. A change of time cross-fades over FADE_SECONDS (cuts with reduced
 * motion). The canvas renders on demand, so while the clouds drift on the
 * street at rest it asks for DRIFT_FPS frames a second, and nothing otherwise.
 * Sets <html data-sky> while the 3D scene shows, for the title (globals.css).
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

import { PALETTE } from "@/components/three/palette";

import { useBuilding } from "../BuildingProvider";
import { FACADE_Z } from "../world";
import { CloudLayers } from "./CloudLayers";
import { blendSky, reducedMotion, skyLook } from "./look";
import { NightSky } from "./NightSky";
import { SkyDome } from "./SkyDome";
import { TIMES_OF_DAY, useTimeOfDay } from "./timeOfDay";

const FADE_SECONDS = 2;
const DRIFT_FPS = 30;
/** Far things fade into the sky: depth on the street, nothing indoors. */
const FOG = { near: 30, far: 110 } as const;
/** The lights turn from the sky's tint to their own across this much either side of the front doors (m). */
const DOORWAY = 2;

export function Sky() {
  const building = useBuilding();
  const invalidate = useThree((s) => s.invalidate);
  // Inside the canvas this is never the server's null; "day" is only a fallback.
  const timeOfDay = useTimeOfDay() ?? "day";
  const show3D = building?.show3D ?? false;
  const drifting = show3D && building?.state.station === "street" && building.state.target === null;

  const background = useRef<THREE.Color>(null);
  const fog = useRef<THREE.Fog>(null);
  const follow = useRef<THREE.Group>(null);
  /** Lines up with TIMES_OF_DAY; null until the first frame, which starts at the time of day (no fade in). */
  const weights = useRef<number[] | null>(null);
  const latest = useRef(timeOfDay);
  useEffect(() => {
    latest.current = timeOfDay;
    invalidate();
  }, [timeOfDay, invalidate]);

  useFrame(({ camera }, delta) => {
    const goal = latest.current;
    const w = (weights.current ??= TIMES_OF_DAY.map((t) => (t === goal ? 1 : 0)));
    // A long wait between demand frames mustn't skip the fade.
    const step = reducedMotion() ? 1 : Math.min(delta, 0.05) / FADE_SECONDS;
    let fading = false;
    for (let i = 0; i < w.length; i++) {
      const d = (TIMES_OF_DAY[i] === goal ? 1 : 0) - w[i];
      if (d === 0) continue;
      w[i] += THREE.MathUtils.clamp(d, -step, step);
      fading = true;
    }
    // Outdoors by where the camera is: the street side of the front doors.
    const outdoors = THREE.MathUtils.smoothstep(camera.position.z, FACADE_Z - DOORWAY, FACADE_Z + DOORWAY);
    blendSky(w, outdoors);

    background.current?.copy(skyLook.color.horizon);
    fog.current?.color.copy(skyLook.color.horizon);
    follow.current?.position.copy(camera.position);
    if (fading) invalidate();
    // After the camera (CameraRig, MouseParallax), before the lights and clouds read the look.
  }, -0.8);

  // Clouds drift: a steady trickle of frames on the street at rest, none elsewhere.
  useEffect(() => {
    if (!drifting || reducedMotion()) return;
    const timer = window.setInterval(invalidate, 1000 / DRIFT_FPS);
    return () => window.clearInterval(timer);
  }, [drifting, invalidate]);

  // The title's colour follows the sky. On first showing it snaps (no fade from the plain backdrop's ink).
  useEffect(() => {
    if (!show3D) return;
    const root = document.documentElement;
    root.dataset.skySnap = "";
    // Two frames: the snapped colour has to be styled before the fade comes back.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => delete root.dataset.skySnap);
    });
    return () => {
      cancelAnimationFrame(frame);
      delete root.dataset.sky;
      delete root.dataset.skySnap;
    };
  }, [show3D]);
  useEffect(() => {
    if (show3D) document.documentElement.dataset.sky = timeOfDay;
  }, [show3D, timeOfDay]);

  return (
    <>
      <color ref={background} attach="background" args={[PALETTE.sky]} />
      <fog ref={fog} attach="fog" args={[PALETTE.sky, FOG.near, FOG.far]} />
      <group ref={follow}>
        <SkyDome />
        <NightSky />
      </group>
      <CloudLayers />
    </>
  );
}
