"use client";

/**
 * The candidate's mic on the interview table: the same control as the room's
 * mic button (TableMic.tsx), read from speaker.current.mic each frame. The
 * button stays the accessible control. Faces +Z.
 */

import { Html } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";

import type { MicState, Speaker } from "@/components/room/types";
import { renderedMaterial } from "@/components/three/rendered";

type Vec3 = [number, number, number];

const BODY_RADIUS = 0.046;
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 32);
const body = new THREE.CapsuleGeometry(BODY_RADIUS, 0.1, 8, 32);
const grille = new THREE.CapsuleGeometry(0.048, 0.05, 8, 24);
const yoke = new THREE.TorusGeometry(0.058, 0.0065, 12, 32, Math.PI);
const ring = new THREE.TorusGeometry(0.017, 0.0028, 12, 40);
const seam = new THREE.TorusGeometry(0.0475, 0.0025, 8, 48);
const dot = new THREE.SphereGeometry(0.0042, 16, 12);
const hitBox = new THREE.BoxGeometry(0.2, 0.4, 0.2);

/** An invisible, generous hit area. */
const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
hitMaterial.userData.outlineParameters = { visible: false };

/** A wire lattice over the grille. */
const grilleMesh = new THREE.CapsuleGeometry(0.0486, 0.05, 10, 28);
const grilleWire = new THREE.MeshBasicMaterial({ color: "#6b727c", wireframe: true, transparent: true, opacity: 0.55 });
grilleWire.userData.outlineParameters = { visible: false };

/** Recording green; the glow is deeper so it doesn't read as cyan. */
const GREEN = "#5be38d";
const GREEN_GLOW = "#1fbf5b";

export function DeskMic({ speaker, at }: { speaker: RefObject<Speaker>; at: Vec3 }) {
  const gl = useThree((s) => s.gl);
  const ringMesh = useRef<THREE.Mesh>(null);
  const dotMesh = useRef<THREE.Mesh>(null);
  const [blocked, setBlocked] = useState(false);
  const blockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (blockTimer.current && clearTimeout(blockTimer.current)), []);

  const m = useMemo(
    () => ({
      body: renderedMaterial(gl, { color: "#1b1d21", roughness: 0.55 }),
      grille: renderedMaterial(gl, { color: "#2a2d33", roughness: 0.85, metalness: 0.3 }),
      metal: renderedMaterial(gl, { color: "#2c3036", roughness: 0.4, metalness: 0.6 }),
      icon: renderedMaterial(gl, { color: "#dfe7ef", roughness: 0.4 }),
      // The status ring and dot, by mic state.
      status: {
        off: renderedMaterial(gl, { color: "#4b5563", roughness: 0.5 }),
        disabled: renderedMaterial(gl, { color: "#4b5563", roughness: 0.5 }),
        ready: renderedMaterial(gl, { color: "#cfd8e3", roughness: 0.3, emissive: "#8fb0d6", emissiveIntensity: 0.6 }),
        recording: renderedMaterial(gl, { color: GREEN, roughness: 0.3, emissive: GREEN_GLOW, emissiveIntensity: 0.9 }),
      } satisfies Record<MicState, THREE.MeshStandardMaterial>,
    }),
    [gl],
  );

  const stateNow = (): MicState =>
    speaker.current.mic?.state ?? (speaker.current.state === "listening" ? "recording" : "off");

  // Follow the mic state without re-rendering the scene.
  useFrame(({ invalidate }) => {
    const material = m.status[stateNow()];
    for (const mesh of [ringMesh.current, dotMesh.current]) {
      if (mesh && mesh.material !== material) {
        mesh.material = material;
        invalidate();
      }
    }
  });

  const hover = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const s = stateNow();
    document.body.style.cursor = s === "ready" || s === "recording" ? "pointer" : s === "disabled" ? "not-allowed" : "";
  };
  const leave = () => {
    document.body.style.cursor = "";
  };
  const press = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const mic = speaker.current.mic;
    if (!mic) return;
    if (mic.state === "disabled") {
      setBlocked(true);
      if (blockTimer.current) clearTimeout(blockTimer.current);
      blockTimer.current = setTimeout(() => setBlocked(false), 1800);
      return;
    }
    mic.toggle();
  };

  // Front of the body: where the ring, dot and knob sit.
  const front = BODY_RADIUS + 0.0008;

  return (
    <group position={at} scale={0.85}>
      {/* Base, stem and yoke */}
      <mesh geometry={cylinder} material={m.metal} position={[0, 0.008, 0]} scale={[0.075, 0.016, 0.075]} />
      <mesh geometry={cylinder} material={m.body} position={[0, 0.019, 0]} scale={[0.066, 0.006, 0.066]} />
      <mesh geometry={cylinder} material={m.metal} position={[0, 0.05, 0]} scale={[0.013, 0.06, 0.013]} />
      <mesh geometry={yoke} material={m.metal} position={[0, 0.135, 0]} rotation={[0, 0, Math.PI]} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh geometry={cylinder} material={m.metal} position={[side * 0.058, 0.16, 0]} scale={[0.0065, 0.05, 0.0065]} />
          <mesh geometry={cylinder} material={m.body} position={[side * 0.072, 0.175, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.017, 0.02, 0.017]} />
        </group>
      ))}

      {/* Body, grille and the seam between them */}
      <mesh geometry={body} material={m.body} position={[0, 0.18, 0]} />
      <mesh geometry={grille} material={m.grille} position={[0, 0.29, 0]} />
      <mesh geometry={grilleMesh} material={grilleWire} position={[0, 0.29, 0]} />
      <mesh geometry={seam} material={m.metal} position={[0, 0.255, 0]} rotation={[Math.PI / 2, 0, 0]} />

      {/* Front: status ring with a mic icon, status dot, knob */}
      <mesh ref={ringMesh} geometry={ring} material={m.status.off} position={[0, 0.205, front]} />
      <mesh geometry={cylinder} material={m.icon} position={[0, 0.208, front]} rotation={[Math.PI / 2, 0, 0]} scale={[0.0035, 0.002, 0.009]} />
      <mesh ref={dotMesh} geometry={dot} material={m.status.off} position={[0, 0.178, front]} />
      <mesh geometry={cylinder} material={m.body} position={[0, 0.152, front]} rotation={[Math.PI / 2, 0, 0]} scale={[0.013, 0.01, 0.013]} />

      <mesh geometry={hitBox} material={hitMaterial} position={[0, 0.18, 0]} onPointerOver={hover} onPointerMove={hover} onPointerOut={leave} onClick={press} />

      {blocked && (
        <Html position={[0, 0.42, 0]} center>
          <span role="status" className="whitespace-nowrap rounded-full bg-ink/90 px-3 py-1 text-xs text-white shadow">
            🚫 Wait for the interviewer to finish
          </span>
        </Html>
      )}
    </group>
  );
}
