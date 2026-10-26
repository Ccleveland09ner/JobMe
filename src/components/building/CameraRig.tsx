"use client";

/**
 * The camera: travels between station poses along fixed paths (stations.ts).
 * Walks report ARRIVE, held walks wait before the last leg, failed walks
 * retrace. Reduced motion cuts. The canvas renders on demand.
 */

import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useRef } from "react";
import * as THREE from "three";

import { prefersReducedMotion } from "@/lib/frontend/motion";

import { useBuilding } from "./BuildingProvider";
import { isPoster, POSTER_CLOSE_UPS, POSTER_GLIDE_SECONDS } from "./landing/layout";
import { fovFor, NOTE_CLOSE_UPS, pathBetween, POSES, type Pose, type Station } from "./stations";
import type { BoardNote } from "./world";

/** Walking pace, metres per second, and the bounds on one leg's duration. */
const PACE = 2.6;
const MIN_LEG = 0.6;
const MAX_LEG = 2.2;

/** How far the user can look around, radians: ±35° yaw, ±12° pitch. */
const MAX_YAW = 0.61;
const MAX_PITCH = 0.21;
// Not the board: its notes carry pinned controls.
const LOOKABLE: ReadonlySet<Station> = new Set(["street", "desk"]);

interface CameraValues {
  px: number;
  py: number;
  pz: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
  /** Pose.fit, or 0. */
  fit: number;
}

const valuesOf = (pose: Pose): CameraValues => ({
  px: pose.position[0],
  py: pose.position[1],
  pz: pose.position[2],
  tx: pose.target[0],
  ty: pose.target[1],
  tz: pose.target[2],
  fov: pose.fov,
  fit: pose.fit ?? 0,
});

const scratch = new THREE.Vector3();

export function CameraRig() {
  const building = useBuilding();
  if (!building) throw new Error("CameraRig must be inside <BuildingProvider>");
  const { state, dispatch, inset, setRedraw, setCameraAt, focus } = building;
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);

  // gsap tweens these numbers; the frame loop copies them onto the camera.
  const cam = useRef<CameraValues>(valuesOf(POSES[state.target ?? state.station]));
  const timeline = useRef<gsap.core.Timeline | null>(null);
  /** Poses reached on the current walk, starting with where it began. */
  const trail = useRef<Pose[]>([]);
  /** The held walk's last leg, played on release. */
  const pending = useRef<Pose | null>(null);
  /** Where the camera last came to rest. */
  const settled = useRef<Station>(state.target ?? state.station);
  const look = useRef({ yaw: 0, pitch: 0, dragging: false, x: 0, y: 0 });
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });

  /** Tween through `poses`, coming to rest at `arrivesAt` (null: a waypoint); each leg `seconds` long, or paced. */
  const travel = (poses: Pose[], arrivesAt: Station | null, done: () => void, seconds?: number) => {
    timeline.current?.kill();
    const reduced = prefersReducedMotion();
    setCameraAt(null);
    const tl = gsap.timeline({
      onComplete: () => {
        setCameraAt(arrivesAt);
        done();
      },
      onUpdate: invalidate,
    });
    let from = cam.current;
    for (const pose of poses) {
      const to = valuesOf(pose);
      const distance = Math.hypot(to.px - from.px, to.py - from.py, to.pz - from.pz);
      const duration = reduced ? 0 : (seconds ?? Math.min(MAX_LEG, Math.max(MIN_LEG, distance / PACE)));
      tl.to(cam.current, { ...to, duration, ease: seconds === undefined ? "power1.inOut" : "power2.inOut", onComplete: () => void trail.current.push(pose) });
      from = to;
    }
    timeline.current = tl;
  };

  // A walk: a new walkId means a new path (including a failed walk's return).
  useEffect(() => {
    const s = latest.current;
    if (s.target === null) return;
    const destination = s.target;

    if (s.returning) {
      pending.current = null;
      const back = [...trail.current].reverse();
      trail.current = [];
      travel(back.length ? back : [POSES[destination]], destination, () => {
        settled.current = destination;
        dispatch({ type: "ARRIVE" });
      });
      return;
    }

    const path = pathBetween(s.station, destination);
    trail.current = [POSES[s.station]];
    const last = path[path.length - 1];
    const finish = () => {
      settled.current = destination;
      dispatch({ type: "ARRIVE" });
    };
    pending.current = null;
    if (!s.holding || path.length < 2) {
      travel(path, destination, finish);
      return;
    }
    travel(path.slice(0, -1), null, () => {
      // Released while still walking: carry straight on.
      if (!latest.current.holding) travel([last], destination, finish);
      else pending.current = last;
    });
    // walkId is the trigger; everything else is read from `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.walkId]);

  // The page released a held walk that is waiting at its waypoint.
  useEffect(() => {
    if (state.holding || !pending.current || state.target === null) return;
    const last = pending.current;
    const destination = state.target;
    pending.current = null;
    travel([last], destination, () => {
      settled.current = destination;
      dispatch({ type: "ARRIVE" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.holding]);

  // A route change with no walk: glide there, report nothing.
  useEffect(() => {
    if (state.target !== null || state.station === settled.current) return;
    const from = settled.current;
    settled.current = state.station;
    travel(pathBetween(from, state.station), state.station, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.station, state.target]);

  // Glide to a note's or a poster's close-up and back. Only on change; route glides are above.
  const lastFocus = useRef(focus);
  useEffect(() => {
    if (lastFocus.current === focus) return;
    lastFocus.current = focus;
    if (state.target !== null) return;
    if (state.station === "street") {
      // Straight from poster to poster too; a new glide replaces one under way.
      travel([isPoster(focus) ? POSTER_CLOSE_UPS[focus] : POSES.street], "street", () => {}, POSTER_GLIDE_SECONDS);
      return;
    }
    if (state.station !== "noteboard") return;
    const closeUp = focus && focus in NOTE_CLOSE_UPS ? NOTE_CLOSE_UPS[focus as BoardNote] : null;
    travel([closeUp ?? POSES.noteboard], "noteboard", () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  useEffect(() => () => void timeline.current?.kill(), []);

  useEffect(() => {
    setRedraw(invalidate);
    return () => setRedraw(() => {});
  }, [setRedraw, invalidate]);

  // Drag to look around.
  useEffect(() => {
    const el = gl.domElement;
    const canLook = () => latest.current.target === null && LOOKABLE.has(latest.current.station) && !prefersReducedMotion();
    const down = (e: PointerEvent) => {
      if (!canLook()) return;
      look.current.dragging = true;
      look.current.x = e.clientX;
      look.current.y = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const l = look.current;
      if (!l.dragging) return;
      l.yaw = THREE.MathUtils.clamp(l.yaw + (e.clientX - l.x) * 0.003, -MAX_YAW, MAX_YAW);
      l.pitch = THREE.MathUtils.clamp(l.pitch + (e.clientY - l.y) * 0.003, -MAX_PITCH, MAX_PITCH);
      l.x = e.clientX;
      l.y = e.clientY;
      invalidate();
    };
    const up = () => {
      look.current.dragging = false;
      invalidate();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [gl, invalidate]);

  // Priority -1: runs before whatever reads the camera, without taking over rendering.
  useFrame(({ camera, size }, delta) => {
    const c = cam.current;
    const l = look.current;
    const persp = camera as THREE.PerspectiveCamera;

    if (!l.dragging && (Math.abs(l.yaw) > 1e-4 || Math.abs(l.pitch) > 1e-4)) {
      const k = Math.exp(-delta * 4);
      l.yaw *= k;
      l.pitch *= k;
      invalidate();
    }

    const aspect = size.width / size.height;
    const fov = fovFor({ position: [0, 0, 0], target: [0, 0, 0], fov: c.fov }, aspect);
    // Too narrow to keep the pose's width in view: step back to fit it.
    let back = 1;
    if (c.fit > 0) {
      const distance = Math.hypot(c.px - c.tx, c.py - c.ty, c.pz - c.tz);
      const needed = c.fit / (Math.tan((fov * Math.PI) / 360) * aspect);
      if (distance > 0 && needed > distance) back = needed / distance;
    }
    persp.position.set(c.tx + (c.px - c.tx) * back, c.ty + (c.py - c.ty) * back, c.tz + (c.pz - c.tz) * back);
    persp.lookAt(scratch.set(c.tx, c.ty, c.tz));
    // What the camera looks at, for the key light's shadows (scene/Lighting.tsx).
    (persp.userData.target ??= new THREE.Vector3()).copy(scratch);
    if (l.yaw || l.pitch) {
      persp.rotateY(-l.yaw);
      persp.rotateX(-l.pitch);
    }

    persp.fov = fov;
    const { right, bottom } = inset.current;
    if (right || bottom) persp.setViewOffset(size.width, size.height, right / 2, bottom / 2, size.width, size.height);
    else persp.clearViewOffset();
    persp.updateProjectionMatrix();
    persp.updateMatrixWorld();
  }, -1);

  return null;
}
