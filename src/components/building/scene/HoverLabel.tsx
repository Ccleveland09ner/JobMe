"use client";

/**
 * Words hovering in the scene, in the reception desk's style: comic 3D
 * lettering (cream face, ink outline and block shadow) that faces the camera
 * and bobs gently, with a small pointer down to what it names. Pointing at it
 * brightens and enlarges it. Plain words: no box, plate or background. Only
 * its invisible hit plane, a little larger than the words, takes the pointer.
 * FloatingLabel (the desk) and the landing page's labels are built on it.
 */

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { letteringGeometry, letteringMaterials, letteringWidth, signMaterial, useLetteringFont } from "@/components/three/lettering";
import { prefersReducedMotion } from "@/lib/frontend/motion";

type Vec3 = [number, number, number];

/** At the desk's letter size; scaled with the letters. */
const pointerGeometry = new THREE.ConeGeometry(0.02, 0.045, 14);
const POINTER_FOR = 0.072;
const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
const hitGeometry = new THREE.PlaneGeometry(1, 1);

const HOVER_SCALE = 1.14;
/** The bob, per desk-sized letter. */
const BOB = 0.012;
/** The outline's width, and the block shadow's drop (right, down), per letter size. */
const STROKE = 0.085;
const DROP: [number, number] = [0.06, -0.085];
/** The street camera's field of view; wider than this (a portrait phone), `grow` labels grow to match. */
const BASE_FOV = 46;
/** How much a pulse swells the words at its height. */
const PULSE_SCALE = 0.18;

export interface PointerHandlers {
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
}

export function HoverLabel({
  at,
  lines,
  size = 0.072,
  depth = 0.022,
  hovered,
  bind,
  onClick,
  visible = true,
  pointer = true,
  pointerSize = 1,
  align = "center",
  grow = false,
  hitScale = 1,
  minTapPx = 0,
  pulse,
}: {
  /** Where it floats, in the world (or its parent group). */
  at: Vec3;
  /** One word or more per line, centred. */
  lines: readonly string[];
  size?: number;
  depth?: number;
  hovered: boolean;
  bind: PointerHandlers;
  onClick: () => void;
  visible?: boolean;
  /** The little cone pointing down at what it names. */
  pointer?: boolean;
  /** The cone's size over its usual (it scales with the letters too). */
  pointerSize?: number;
  /** Where `at` is on the words: their middle, or their left or right end. */
  align?: "center" | "left" | "right";
  /** Keep its size on screen when a narrow screen widens the field of view. */
  grow?: boolean;
  /** The hit plane's size over the words' own. */
  hitScale?: number;
  /** Never let the hit plane look smaller than this on screen (CSS px), for fingers. */
  minTapPx?: number;
  /** 0 to 1, read every frame: a one-off swell to draw the eye. */
  pulse?: { current: number };
}) {
  const font = useLetteringFont();
  const invalidate = useThree((s) => s.invalidate);

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
  const top = ((words.length - 1) / 2) * lineHeight;
  const pointerScale = (size / POINTER_FOR) * pointerSize;
  const pointerY = -top - size * 0.9 - 0.035 * pointerScale;
  // The words, and the pointer below them if any.
  const hitW = (width + size * 2) * hitScale;
  const bottom = pointer ? pointerY - 0.03 * pointerScale : -top - size;
  const hitH = (top + size - bottom) * hitScale;
  const hitY = (top + size + bottom) / 2;

  const group = useRef<THREE.Group>(null);
  const hit = useRef<THREE.Mesh>(null);
  const scale = useRef(1);
  // Each label bobs out of step with its neighbours.
  const phase = (at[0] * 5.3 + at[2] * 1.7) % (Math.PI * 2);

  useFrame(({ camera, clock, size: screen }, delta) => {
    const g = group.current;
    if (!g) return;
    const cam = camera as THREE.PerspectiveCamera;
    // Facing the camera in the world, whatever its parents' turn.
    if (g.parent) g.quaternion.copy(g.parent.getWorldQuaternion(turn).invert().multiply(camera.quaternion));
    else g.quaternion.copy(camera.quaternion);
    const still = prefersReducedMotion();
    const bob = still ? 0 : Math.sin(clock.elapsedTime * 1.7 + phase) * BOB * (size / POINTER_FOR);
    g.position.set(at[0], at[1] + bob, at[2]);
    const goal = hovered ? HOVER_SCALE : 1;
    scale.current += (goal - scale.current) * (1 - Math.exp(-delta * 12));
    if (Math.abs(goal - scale.current) < 1e-3) scale.current = goal;
    else invalidate();
    const swell = 1 + PULSE_SCALE * (pulse?.current ?? 0);
    const widen = grow ? Math.max(1, cam.fov / BASE_FOV) : 1;
    g.scale.setScalar(scale.current * swell * widen);

    const h = hit.current;
    if (h) {
      let tap = 1;
      if (minTapPx > 0) {
        // Metres per CSS pixel where the label floats, and the plane's smaller side on screen.
        g.getWorldPosition(scratch);
        const distance = scratch.distanceTo(camera.position);
        const perPx = (2 * distance * Math.tan((cam.fov * Math.PI) / 360)) / screen.height;
        const shown = Math.min(hitW, hitH) * g.scale.x;
        if (shown > 0) tap = Math.max(1, (minTapPx * perPx) / shown);
      }
      h.scale.set(hitW * tap, hitH * tap, 1);
    }
  });

  const letters = letteringMaterials(hovered ? "accent" : "paper", "ink");
  const ink = letteringMaterials("ink", "ink");
  const behind = -depth / 2 - 0.004;
  const half = width / 2 + size / 2;
  const shift = align === "left" ? half : align === "right" ? -half : 0;
  return (
    <group ref={group} position={at} visible={visible}>
      <group position={[shift, 0, 0]}>
      {words.map((w, i) => (
        <group key={i} position={[0, top - i * lineHeight, 0]}>
          <mesh geometry={w.face} material={letters} />
          <mesh geometry={w.ink} material={ink} position={[0, 0, behind]} />
          <mesh geometry={w.ink} material={ink} position={[size * DROP[0], size * DROP[1], behind - 0.008]} />
        </group>
      ))}
      {pointer && (
        <mesh
          geometry={pointerGeometry}
          material={signMaterial(hovered ? "accent" : "ink")}
          position={[0, pointerY, 0]}
          rotation={[Math.PI, 0, 0]}
          scale={pointerScale}
        />
      )}
      {/* Only this takes the pointer; hidden, it takes none. */}
      {visible && (
        <mesh
          ref={hit}
          geometry={hitGeometry}
          material={hitMaterial}
          position={[0, hitY, 0]}
          scale={[hitW, hitH, 1]}
          {...bind}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        />
      )}
      </group>
    </group>
  );
}

const scratch = new THREE.Vector3();
const turn = new THREE.Quaternion();
