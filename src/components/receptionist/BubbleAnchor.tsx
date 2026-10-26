"use client";

/**
 * Inside the canvas: pins the receptionist's speech bubble (registered as
 * BUBBLE_ANCHOR) beside her head each frame, its tail at the point just
 * up and to the left of her hair. It stays inside the viewport, and hides
 * while her head is out of view (the voice goes on).
 */

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { useBuilding } from "@/components/building/BuildingProvider";
import { SECRETARY } from "@/components/building/world";

export const BUBBLE_ANCHOR = "receptionist:bubble";

/** Where the tail points: beside her afro, toward the empty wall on her right (the user's left). */
const TAIL_AT = new THREE.Vector3(SECRETARY.x - 0.17, 1.31, SECRETARY.z + 0.05);
/** Her head, to tell whether she's in view. */
const HEAD_AT = new THREE.Vector3(SECRETARY.x, 1.15, SECRETARY.z);
/** The tail's tip, from the bubble's bottom-right corner, and how near either end it may slide (CSS px; ReceptionistBubble draws it). */
export const TAIL_TIP = { fromRight: 42, below: 13, edge: 30 } as const;
/** Kept this far inside the viewport's edges (CSS px). */
const MARGIN = 12;

const v = new THREE.Vector3();

export function BubbleAnchor() {
  const building = useBuilding();
  useFrame(({ camera, size }) => {
    const el = building?.anchors.current.get(BUBBLE_ANCHOR);
    if (!el) return;
    camera.updateMatrixWorld();
    v.copy(HEAD_AT).project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.02 || Math.abs(v.y) > 1.02) {
      el.style.visibility = "hidden";
      return;
    }
    v.copy(TAIL_AT).project(camera);
    const x = ((v.x + 1) / 2) * size.width;
    const y = ((1 - v.y) / 2) * size.height;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = THREE.MathUtils.clamp(x - (w - TAIL_TIP.fromRight), MARGIN, Math.max(MARGIN, size.width - w - MARGIN));
    const top = THREE.MathUtils.clamp(y - (h + TAIL_TIP.below), MARGIN, Math.max(MARGIN, size.height - h - MARGIN));
    // Held inside the viewport, the bubble slides; its tail slides back along the edge to still point at her.
    const tail = THREE.MathUtils.clamp(left + w - x, TAIL_TIP.edge, w - TAIL_TIP.edge);
    el.style.visibility = "";
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    el.style.setProperty("--tail-from-right", `${Math.round(tail)}px`);
  });
  return null;
}
