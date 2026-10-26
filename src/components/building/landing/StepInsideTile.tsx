"use client";

/**
 * The way in, on the path: a larger gold paver that pulses slowly under a soft
 * beam of light, an arrow bobbing over it, and above that a cream placard
 * reading "Step inside" that always faces the camera. Any of them starts the
 * walk in. The placard and arrow grow on narrow screens (wider field of view),
 * so they read the same size on a phone. One invisible hitbox, larger than
 * all of it, takes the pointer.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { studioEnvironment } from "@/components/three/environment";
import { finishMaterial } from "@/components/three/finishes";
import { letteringGeometry, letteringMaterials, letteringWidth, signMaterial, useLetteringFont } from "@/components/three/lettering";

import { useBuilding } from "../BuildingProvider";
import { useCanTouch, usePointing } from "../scene/Interactive";
import { roundedSlab } from "../scene/shapes";
import { reducedMotion, skyLook } from "../sky/look";
import { STEP_INSIDE } from "./copy";
import { LANDING_ACTIONS, TILE } from "./layout";

const GOLD = { color: "#d6a23e", glow: "#ffbe5c" } as const;
/** The plate's glow: at rest, the pulse on top, extra at night, and on hover. */
const GLOW = { rest: 0.25, pulse: 0.3, night: 0.35, hover: 0.45 } as const;
const PULSE_SPEED = 1.4;
const BEAM = { height: 2.6, top: 0.55, bottom: 0.7, opacity: 0.32 } as const;
/** The arrow's centre height, its bob, and the gap from its centre up to the placard (m). */
const ARROW = { y: 1.0, bob: 0.06, gap: 0.5 } as const;
const PLACARD = { letter: 0.13, padX: 0.16, padY: 0.11 } as const;
/** The street pose's field of view; wider than this (portrait), the arrow and placard grow to match. */
const BASE_FOV = 46;
const HIT = { scale: 1.8, height: 2.6 } as const;

const tileGeometry = new THREE.BoxGeometry(TILE.size, 0.05, TILE.size);
const rimGeometry = new THREE.BoxGeometry(TILE.size + 0.12, 0.03, TILE.size + 0.12);
const beamGeometry = new THREE.CylinderGeometry(BEAM.top, BEAM.bottom, BEAM.height, 24, 1, true);
const arrowHead = new THREE.ConeGeometry(0.16, 0.26, 6);
const arrowShaft = new THREE.CylinderGeometry(0.05, 0.05, 0.24, 6);
const hitGeometry = new THREE.BoxGeometry(TILE.size * HIT.scale, HIT.height, TILE.size * HIT.scale);
const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
/** The placard's soft drop shadow. */
const shadowMaterial = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false });

const goldMaterials = new WeakMap<THREE.WebGLRenderer, THREE.MeshStandardMaterial>();
function goldMaterial(gl: THREE.WebGLRenderer): THREE.MeshStandardMaterial {
  let material = goldMaterials.get(gl);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: GOLD.color,
      emissive: GOLD.glow,
      emissiveIntensity: GLOW.rest,
      roughness: 0.35,
      metalness: 0.3,
      envMap: studioEnvironment(gl),
      envMapIntensity: 0.6,
    });
    goldMaterials.set(gl, material);
  }
  return material;
}

const beamVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;

const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    // Strongest at the tile, gone at the top; soft at the beam's edges.
    float a = pow(1.0 - vUv.y, 1.6) * pow(vFacing, 1.5) * uOpacity;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

export function StepInsideTile() {
  const gl = useThree((s) => s.gl);
  const font = useLetteringFont();
  const building = useBuilding();
  const canTouch = useCanTouch("street") && building?.focus === null;
  const { hovered, bind } = usePointing(LANDING_ACTIONS.stepInside, canTouch);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [hovered, invalidate]);

  const beamMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        uniforms: { uColor: { value: new THREE.Color(GOLD.glow) }, uOpacity: { value: BEAM.opacity } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [],
  );
  useEffect(() => () => beamMaterial.dispose(), [beamMaterial]);

  const text = letteringGeometry(font, { text: STEP_INSIDE.toUpperCase(), size: PLACARD.letter, depth: 0.004 });
  const placardW = letteringWidth(text) + PLACARD.padX * 2;
  const placardH = PLACARD.letter + PLACARD.padY * 2;

  const tile = useRef<THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>>(null);
  const beam = useRef<THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>>(null);
  const arrow = useRef<THREE.Group>(null);
  const placard = useRef<THREE.Group>(null);
  const hover = useRef(0);

  useFrame(({ camera, clock }, delta) => {
    const still = reducedMotion();
    const t = clock.elapsedTime;
    const pulse = still ? 0.5 : 0.5 + 0.5 * Math.sin(t * PULSE_SPEED);
    hover.current += ((hovered ? 1 : 0) - hover.current) * (1 - Math.exp(-Math.min(delta, 0.1) * 10));
    if (Math.abs((hovered ? 1 : 0) - hover.current) > 1e-3) invalidate();
    const night = skyLook.value.lamp;

    if (tile.current) {
      tile.current.material.emissiveIntensity = GLOW.rest + GLOW.pulse * pulse + GLOW.night * night + GLOW.hover * hover.current;
    }
    if (beam.current) beam.current.material.uniforms.uOpacity.value = BEAM.opacity * (0.75 + 0.25 * pulse) * (1 + 0.5 * night);

    // Same size on screen however wide the field of view has grown.
    const grow = Math.max(1, (camera as THREE.PerspectiveCamera).fov / BASE_FOV);
    const bob = still ? 0 : Math.sin(t * 1.8) * ARROW.bob;
    const lift = 1 + 0.06 * hover.current;
    if (arrow.current) {
      arrow.current.position.y = ARROW.y * grow + bob;
      arrow.current.scale.setScalar(grow * lift);
    }
    if (placard.current) {
      placard.current.position.y = ARROW.y * grow + bob + (ARROW.gap + placardH / 2) * grow;
      placard.current.quaternion.copy(camera.quaternion);
      placard.current.scale.setScalar(grow * lift);
    }
  });

  return (
    <group position={[TILE.x, 0, TILE.z]}>
      {/* The plate, on a stone rim, just proud of the path. */}
      <mesh geometry={rimGeometry} material={finishMaterial(gl, "stone")} position={[0, 0.015, 0]} receiveShadow />
      <mesh ref={tile} geometry={tileGeometry} material={goldMaterial(gl)} position={[0, 0.045, 0]} receiveShadow />
      <mesh ref={beam} geometry={beamGeometry} material={beamMaterial} position={[0, 0.07 + BEAM.height / 2, 0]} renderOrder={1} />

      {/* The arrow, pointing down at the plate. */}
      <group ref={arrow} position={[0, ARROW.y, 0]}>
        <mesh geometry={arrowHead} material={signMaterial("accent")} rotation={[Math.PI, 0, 0]} />
        <mesh geometry={arrowShaft} material={signMaterial("accent")} position={[0, 0.24, 0]} />
      </group>

      {/* The placard: cream card, ink outline, a soft drop shadow, ink letters. */}
      <group ref={placard}>
        <mesh
          geometry={roundedSlab({ w: placardW + 0.05, h: placardH + 0.05, r: 0.07, depth: 0.004 })}
          material={shadowMaterial}
          position={[0.035, -0.045, -0.02]}
        />
        <mesh geometry={roundedSlab({ w: placardW + 0.05, h: placardH + 0.05, r: 0.07, depth: 0.008 })} material={signMaterial("ink")} position={[0, 0, -0.012]} />
        <mesh geometry={roundedSlab({ w: placardW, h: placardH, r: 0.05, depth: 0.01 })} material={signMaterial("paper")} />
        <mesh geometry={text} material={letteringMaterials(hovered ? "accent" : "ink", "ink")} position={[0, 0, 0.016]} />
      </group>

      {/* Larger than everything above, and all that takes the pointer. */}
      <mesh
        geometry={hitGeometry}
        material={hitMaterial}
        position={[0, HIT.height / 2, 0]}
        {...bind}
        onClick={(e) => {
          e.stopPropagation();
          if (canTouch) building?.activate(LANDING_ACTIONS.stepInside);
        }}
      />
    </group>
  );
}
