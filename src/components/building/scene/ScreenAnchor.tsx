"use client";

/**
 * Pins the DOM element registered as `name` (building.setAnchor) onto a
 * rectangle in the parent group's XY plane: each frame its corners are
 * projected and the element is moved, sized and rotated to cover it.
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
    // Fresh matrices: the renderer only updates them after frame callbacks.
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
