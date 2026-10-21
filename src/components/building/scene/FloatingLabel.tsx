"use client";

/**
 * An object's name floating over it ("LEDGER", "REPORTS", …): comic 3D
 * lettering that faces the camera. Pointing at it or its object lights both;
 * clicking either runs the action. Hidden while the object is held.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { letteringGeometry, letteringMaterials, letteringWidth, useLetteringFont } from "@/components/three/lettering";
import { toonMaterial } from "@/components/three/toon";
import { prefersReducedMotion } from "@/lib/frontend/motion";

import { useBuilding } from "../BuildingProvider";
import type { Held } from "../heldMachine";
import type { Station } from "../stations";
import { useCanTouch, usePointing } from "./Interactive";

type Vec3 = [number, number, number];

const pointerGeometry = new THREE.ConeGeometry(0.02, 0.045, 14);
/** A generous, invisible target round the words, so they are easy to click. */
const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });

const HOVER_SCALE = 1.14;
const BOB = 0.012;
/** The outline's width, and the block shadow's drop (right, down), per letter size. */
const STROKE = 0.085;
const DROP: [number, number] = [0.06, -0.085];

export function FloatingLabel({
  action,
  station,
  at,
  lines,
  size = 0.072,
  depth = 0.022,
  holds,
}: {
  /** The action it runs (and the name it is pointed at by). */
  action: string;
  station: Station;
  /** Where it floats, in the world: just above its object. */
  at: Vec3;
  /** One word or more per line, centred. */
  lines: readonly string[];
  size?: number;
  depth?: number;
  /** The held object it names: hidden while that is picked up. */
  holds?: Held;
}) {
  const font = useLetteringFont();
  const building = useBuilding();
  const canTouch = useCanTouch(station);
  const { hovered, bind } = usePointing(action, canTouch);
  const invalidate = useThree((s) => s.invalidate);
  const lifted = holds !== undefined && building?.held.held === holds && building.held.phase !== "resting";

  const key = lines.join("\n");
  const words = useMemo(
    () =>
      key.split("\n").map((text) => ({
        face: letteringGeometry(font, { text, size, depth }),
        ink: letteringGeometry(font, { text, size, depth: depth * 0.4, stroke: size * STROKE }),
      })),
    [font, key, size, depth],
  );
  const lineHeight = size * 1.4;
  const width = Math.max(...words.map((w) => letteringWidth(w.face)));
  const height = words.length * lineHeight;
  const top = ((words.length - 1) / 2) * lineHeight;

  const group = useRef<THREE.Group>(null);
  const scale = useRef(1);
  // Each label bobs out of step with its neighbours.
  const phase = (at[0] * 5.3 + at[2] * 1.7) % (Math.PI * 2);

  useFrame(({ camera, clock }, delta) => {
    const g = group.current;
    if (!g) return;
    g.quaternion.copy(camera.quaternion);
    const bob = prefersReducedMotion() ? 0 : Math.sin(clock.elapsedTime * 1.7 + phase) * BOB;
    g.position.set(at[0], at[1] + bob, at[2]);
    const goal = hovered ? HOVER_SCALE : 1;
    scale.current += (goal - scale.current) * (1 - Math.exp(-delta * 12));
    if (Math.abs(goal - scale.current) < 1e-3) scale.current = goal;
    else invalidate();
    g.scale.setScalar(scale.current);
  });

  const letters = letteringMaterials(hovered ? "accent" : "paper", "ink", false);
  const ink = letteringMaterials("ink", "ink", false);
  const behind = -depth / 2 - 0.004;
  return (
    <group
      ref={group}
      position={at}
      visible={!lifted}
      {...bind}
      onClick={(e) => {
        e.stopPropagation();
        if (canTouch) building?.activate(action);
      }}
    >
      {words.map((w, i) => (
        <group key={i} position={[0, top - i * lineHeight, 0]}>
          <mesh geometry={w.face} material={letters} />
          <mesh geometry={w.ink} material={ink} position={[0, 0, behind]} />
          <mesh geometry={w.ink} material={ink} position={[size * DROP[0], size * DROP[1], behind - 0.008]} />
        </group>
      ))}
      {/* The pointer, down to the object. */}
      <mesh
        geometry={pointerGeometry}
        material={toonMaterial(hovered ? "accent" : "ink")}
        position={[0, -top - size * 0.9 - 0.035, 0]}
        rotation={[Math.PI, 0, 0]}
      />
      <mesh material={hitMaterial} position={[0, -size * 0.25, 0]}>
        <planeGeometry args={[width + 0.14, height + size + 0.1]} />
      </mesh>
    </group>
  );
}
