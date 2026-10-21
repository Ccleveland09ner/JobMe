"use client";

/**
 * Pins a DOM element onto a rectangle in the scene.
 *
 * Every rendered frame (no React render), the rectangle's corners are
 * projected through the camera, and the element registered under `name`
 * (building.setAnchor) is moved and sized to cover exactly that rectangle —
 * rotated with it, if it is tilted. The element is ordinary, sharp,
 * accessible DOM; it just sits where the 3D thing is. Used to put the
 * settings controls onto the notice board's own notes: the board is the 3D
 * one, the writing on its notes is real form controls.
 *
 * Place it inside the group the rectangle belongs to; the rectangle lies in
 * that group's XY plane, centred on `position`.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { useBuilding } from "../BuildingProvider";

type Vec3 = [number, number, number];

const corner = {
  tl: new THREE.Vector3(),
  tr: new THREE.Vector3(),
  bl: new THREE.Vector3(),
  br: new THREE.Vector3(),
};

function toScreen(v: THREE.Vector3, group: THREE.Object3D, camera: THREE.Camera, w: number, h: number): THREE.Vector3 {
  v.applyMatrix4(group.matrixWorld).project(camera);
  return v.set(((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h, v.z);
}

export function ScreenAnchor({
  name,
  width,
  height,
  position = [0, 0, 0],
}: {
  name: string;
  width: number;
  height: number;
  position?: Vec3;
}) {
  const building = useBuilding();
  const group = useRef<THREE.Group>(null);

  useFrame(({ camera, size }) => {
    const el = building?.anchors.current.get(name);
    const g = group.current;
    if (!el || !g) return;
    // This frame's camera (CameraRig has already moved it) and this frame's
    // place for the rectangle: the renderer only refreshes world matrices
    // after the frame callbacks, and with on-demand frames a stale
    // projection could be the last word.
    camera.updateMatrixWorld();
    g.updateWorldMatrix(true, false);
    const tl = toScreen(corner.tl.set(-width / 2, height / 2, 0), g, camera, size.width, size.height);
    const tr = toScreen(corner.tr.set(width / 2, height / 2, 0), g, camera, size.width, size.height);
    const bl = toScreen(corner.bl.set(-width / 2, -height / 2, 0), g, camera, size.width, size.height);
    const br = toScreen(corner.br.set(width / 2, -height / 2, 0), g, camera, size.width, size.height);
    // Behind the camera: nothing to pin to.
    if (tl.z > 1 || br.z > 1) {
      el.style.visibility = "hidden";
      return;
    }
    const w = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const h = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    const cx = (tl.x + br.x) / 2;
    const cy = (tl.y + br.y) / 2;
    const angle = Math.atan2(tr.y - tl.y, tr.x - tl.x);
    el.style.visibility = "";
    el.style.left = `${cx - w / 2}px`;
    el.style.top = `${cy - h / 2}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.transform = `rotate(${angle}rad)`;
  });

  return <group ref={group} position={position} />;
}
