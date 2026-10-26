"use client";

/**
 * On the street, the camera drifts a little with the mouse, so the scene reads
 * as 3D before any click. It moves without turning: the camera and the point
 * it looks at shift together. Off during walks (it eases back to nothing as
 * one starts, so the walk's path is untouched), on touch screens, and with
 * reduced motion.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type * as THREE from "three";

import { useBuilding } from "../BuildingProvider";
import { reducedMotion } from "./look";

/** At the screen's edge, in metres. */
const SHIFT = { x: 0.8, y: 0.4 } as const;
/** How quickly the camera catches up with the mouse, per second. */
const DAMPING = 3;

export function MouseParallax() {
  const building = useBuilding();
  const invalidate = useThree((s) => s.invalidate);
  // Not while a poster is up close either.
  const active = building?.state.station === "street" && building.state.target === null && building.focus === null;
  const latest = useRef(active);
  useEffect(() => {
    latest.current = active;
    invalidate();
  }, [active, invalidate]);

  /** The mouse, -1 to 1 across the window (y up), and the camera's eased offset in the same units. */
  const pointer = useRef({ x: 0, y: 0 });
  const offset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // A mouse or trackpad, not a finger.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const move = (e: PointerEvent) => {
      // Not while touching, or dragging to look around (CameraRig).
      if (e.pointerType === "touch" || e.buttons !== 0) return;
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = 1 - (e.clientY / window.innerHeight) * 2;
      if (latest.current) invalidate();
    };
    const away = () => {
      pointer.current.x = 0;
      pointer.current.y = 0;
      invalidate();
    };
    window.addEventListener("pointermove", move);
    document.documentElement.addEventListener("pointerleave", away);
    window.addEventListener("blur", away);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", away);
      window.removeEventListener("blur", away);
    };
  }, [invalidate]);

  // After CameraRig has placed the camera this frame.
  useFrame(({ camera }, delta) => {
    const o = offset.current;
    const on = latest.current && !reducedMotion();
    const gx = on ? pointer.current.x : 0;
    const gy = on ? pointer.current.y : 0;
    // A long wait between demand frames mustn't snap it.
    const k = 1 - Math.exp(-Math.min(delta, 1 / 30) * DAMPING);
    o.x += (gx - o.x) * k;
    o.y += (gy - o.y) * k;
    if (Math.abs(gx - o.x) < 1e-4 && Math.abs(gy - o.y) < 1e-4) {
      o.x = gx;
      o.y = gy;
    } else invalidate();
    if (o.x === 0 && o.y === 0) return;

    const dx = o.x * SHIFT.x;
    const dy = o.y * SHIFT.y;
    camera.position.x += dx;
    camera.position.y += dy;
    // What the key light's shadows centre on moves with it (scene/Lighting.tsx).
    const target = camera.userData.target as THREE.Vector3 | undefined;
    if (target) {
      target.x += dx;
      target.y += dy;
    }
    camera.updateMatrixWorld();
  }, -0.9);

  return null;
}
