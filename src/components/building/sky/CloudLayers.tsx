"use client";

/**
 * Clouds behind the building, in three layers: the higher a layer, the
 * farther, bigger and slower its clouds, which gives the sky depth. They
 * drift a few minutes across the screen and wrap round well out of view.
 * Billboards turned to face the camera, cut from one shared atlas.
 */

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { POSES } from "../stations";
import { reducedMotion, skyLook } from "./look";
import { CLOUD_ATLAS, CLOUD_CELLS, seededRandom, useCanvasTexture } from "./textures";

interface Layer {
  z: number;
  /** Heights of the clouds' centres, between which they're scattered (m). */
  y: [number, number];
  width: [number, number];
  count: number;
  /** Drift to the right, m/s. */
  speed: number;
  opacity: number;
  /** Lower layers a touch greyer. */
  shade: number;
}

/**
 * Seen from the street, between the roofline (~16°) and the title (~23° up).
 * Every cloud's depth stays inside the camera's far plane (120 m).
 */
const LAYERS: readonly Layer[] = [
  // About 6 minutes across the screen.
  { z: -85, y: [47, 54], width: [34, 46], count: 5, speed: 0.45, opacity: 0.85, shade: 1 },
  // About 4.
  { z: -60, y: [30, 35], width: [22, 30], count: 6, speed: 0.55, opacity: 0.9, shade: 0.96 },
  // About 2, peeking over the roof.
  { z: -38, y: [19, 22], width: [14, 19], count: 7, speed: 0.7, opacity: 0.95, shade: 0.92 },
];

const STREET_Z = POSES.street.position[2];

interface CloudSpot {
  layer: number;
  x: number;
  y: number;
  width: number;
  cell: number;
  flip: boolean;
}

/** Each layer wraps this far either side of the middle: past the widest view, plus a cloud. */
const halfSpan = (layer: Layer) => (STREET_Z - layer.z) * 1.1 + layer.width[1];

const CLOUDS: readonly CloudSpot[] = LAYERS.flatMap((layer, li) => {
  const random = seededRandom(li * 131 + 7);
  const half = halfSpan(layer);
  const gap = (2 * half) / layer.count;
  return Array.from({ length: layer.count }, (_, i) => ({
    layer: li,
    // Evenly spaced, jittered, so they never bunch up or line up.
    x: -half + gap * (i + 0.2 + 0.6 * random()),
    y: layer.y[0] + (layer.y[1] - layer.y[0]) * random(),
    width: layer.width[0] + (layer.width[1] - layer.width[0]) * random(),
    cell: (i + li) % CLOUD_CELLS,
    flip: random() < 0.5,
  }));
});

/** A 2:1 plane per atlas cell, its uvs on that cell, shaded lighter on top. */
function cloudGeometry(cell: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(1, 0.5, 1, 2);
  const u0 = (cell % 2) * 0.5;
  // Row 0 of the canvas is the texture's top (flipY).
  const v0 = Math.floor(cell / 2) === 0 ? 0.5 : 0;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
  // Rows top, middle, bottom: sunlit tops, cooler grey undersides.
  const rows = [
    [1, 1, 1],
    [0.93, 0.94, 0.96],
    [0.72, 0.76, 0.84],
  ];
  const colors = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) colors.set(rows[Math.floor(i / 2)], i * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

type CloudMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

const FIRST_OF_LAYER = LAYERS.map((_, li) => CLOUDS.findIndex((c) => c.layer === li));

const geometries = Array.from({ length: CLOUD_CELLS }, (_, cell) => cloudGeometry(cell));

const wrap = (x: number, half: number) => ((((x + half) % (2 * half)) + 2 * half) % (2 * half)) - half;

export function CloudLayers() {
  const atlas = useCanvasTexture(CLOUD_ATLAS);
  const materials = useMemo(
    () =>
      LAYERS.map(
        () =>
          new THREE.MeshBasicMaterial({
            alphaMap: atlas,
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            fog: false,
            toneMapped: false,
          }),
      ),
    [atlas],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  const group = useRef<THREE.Group>(null);
  /** Seconds of drift so far. */
  const drift = useRef(0);

  useFrame(({ camera }, delta) => {
    // Only while frames come: a long pause between them doesn't jump the clouds.
    if (!reducedMotion()) drift.current += Math.min(delta, 0.1);
    const meshes = group.current?.children as CloudMesh[] | undefined;
    if (!meshes) return;
    for (let i = 0; i < CLOUDS.length; i++) {
      const cloud = CLOUDS[i];
      const layer = LAYERS[cloud.layer];
      const mesh = meshes[i];
      // A layer's clouds share its material: tint it once, through the first.
      if (FIRST_OF_LAYER[cloud.layer] === i) {
        mesh.material.color.copy(skyLook.color.cloud).multiplyScalar(layer.shade);
        mesh.material.opacity = skyLook.value.cloudOpacity * layer.opacity;
      }
      const x = wrap(cloud.x + layer.speed * drift.current, halfSpan(layer));
      mesh.position.x = x;
      // Turned toward the camera about the vertical, so the far ones aren't edge-on.
      mesh.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - layer.z);
    }
  });

  return (
    <group ref={group}>
      {CLOUDS.map((cloud, i) => (
        <mesh
          key={i}
          geometry={geometries[cloud.cell]}
          material={materials[cloud.layer]}
          position={[cloud.x, cloud.y, LAYERS[cloud.layer].z]}
          scale={[cloud.flip ? -cloud.width : cloud.width, cloud.width, 1]}
        />
      ))}
    </group>
  );
}
