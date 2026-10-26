"use client";

/**
 * The way in: one of the path's own pavers, glowing like a calm beacon. A
 * soft amber light fades up, holds, fades down to almost nothing and rests,
 * every two seconds, with a faint pool on the stones around it. Above it the
 * words STEP INSIDE hover in the reception style, their arrow pointing down at
 * it. The paver, the arrow or the words start the walk in. Reduced motion: a
 * steady soft glow, and nothing bobs.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { finishMaterial } from "@/components/three/finishes";

import { useBuilding } from "../BuildingProvider";
import { HoverLabel } from "../scene/HoverLabel";
import { useCanTouch, usePointing } from "../scene/Interactive";
import { reducedMotion, skyLook } from "../sky/look";
import { SOFT_DOT, useCanvasTexture } from "../sky/textures";
import { LABELS } from "./copy";
import { LANDING_ACTIONS, PATH, TILE } from "./layout";

const AMBER = "#ffb347";
/** One beat (s): up, held, down, then resting until the next. About 0.8 s on, 1.2 s off. */
const BEAT = { up: 0.25, hold: 0.55, down: 0.3, period: 2 } as const;
/** Resting, between beats: almost nothing. */
const FLOOR = 0.04;
/** The paver's glow at the top of a beat, by day and extra by night; a touch more when pointed at. */
const GLOW = { day: 0.55, night: 0.25, hover: 0.25, still: 0.45 } as const;
/** The pool on the stones: one paver beyond the tile on every side, and how strong at most. */
const POOL = { size: PATH.paver * 3, day: 0.32, night: 0.5 } as const;
const LABEL = { y: 1.25, size: 0.17, arrow: 2.2 } as const;
const HIT = 1.8;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** 0 to 1 through a beat; never a hard edge. */
function beat(t: number): number {
  const p = t % BEAT.period;
  const s =
    p < BEAT.up
      ? smooth(p / BEAT.up)
      : p < BEAT.up + BEAT.hold
        ? 1
        : p < BEAT.up + BEAT.hold + BEAT.down
          ? 1 - smooth((p - BEAT.up - BEAT.hold) / BEAT.down)
          : 0;
  return FLOOR + (1 - FLOOR) * s;
}

/** A quad the size of one paver, its uvs in metres where the path's are, so its stones and grout line up. */
function paverGeometry(): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(PATH.paver, PATH.paver);
  const u0 = TILE.x - PATH.paver / 2 - PATH.leftX;
  const v0 = PATH.farZ - (TILE.z + PATH.paver / 2);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * PATH.paver, v0 + uv.getY(i) * PATH.paver);
  return geometry;
}

const paver = paverGeometry();
const pool = new THREE.PlaneGeometry(POOL.size, POOL.size);
const hitGeometry = new THREE.BoxGeometry(PATH.paver * HIT, 0.3, PATH.paver * HIT);
const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });

export function StepInsideTile() {
  const gl = useThree((s) => s.gl);
  const building = useBuilding();
  const invalidate = useThree((s) => s.invalidate);
  const canTouch = useCanTouch("street") && building?.focus === null;
  const { hovered, bind } = usePointing(LANDING_ACTIONS.stepInside, canTouch);
  useEffect(() => invalidate(), [hovered, invalidate]);
  const dot = useCanvasTexture(SOFT_DOT);

  // The path's own stone, which can glow: a copy, so the path itself never changes.
  const stone = useMemo(() => {
    const m = finishMaterial(gl, "path").clone();
    m.emissive.set(AMBER);
    m.emissiveIntensity = 0;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
    m.polygonOffsetUnits = -1;
    return m;
  }, [gl]);
  useEffect(() => () => stone.dispose(), [stone]);

  const tile = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>>(null);
  const glow = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const still = reducedMotion();
    const level = still ? GLOW.still : beat(clock.elapsedTime);
    const night = skyLook.value.lamp;
    if (tile.current) {
      tile.current.material.emissiveIntensity = level * (GLOW.day + GLOW.night * night) + (hovered ? GLOW.hover : 0);
    }
    if (glow.current) glow.current.opacity = level * (POOL.day + (POOL.night - POOL.day) * night);
  });

  const activate = () => {
    if (canTouch) building?.activate(LANDING_ACTIONS.stepInside);
  };

  return (
    <group position={[TILE.x, 0, TILE.z]}>
      <mesh ref={tile} geometry={paver} material={stone} position={[0, PATH.top + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
      <mesh geometry={pool} position={[0, PATH.top + 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <meshBasicMaterial
          ref={glow}
          map={dot}
          color={AMBER}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh
        geometry={hitGeometry}
        material={hitMaterial}
        position={[0, 0.15, 0]}
        {...bind}
        onClick={(e) => {
          e.stopPropagation();
          activate();
        }}
      />
      <HoverLabel
        at={[0, LABEL.y, 0]}
        lines={[LABELS.stepInside]}
        size={LABEL.size}
        depth={0.03}
        pointerSize={LABEL.arrow}
        hovered={hovered}
        bind={bind}
        onClick={activate}
        grow
        hitScale={HIT}
        minTapPx={44}
      />
    </group>
  );
}
