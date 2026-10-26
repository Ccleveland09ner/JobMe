"use client";

/**
 * A poster stand beside the path: a paper board in a wooden frame between two
 * posts, its title painted on, angled toward the street. Pointing at it lifts
 * it a little and brightens the paper; at dusk and night the paper glows
 * faintly, enough to read. On a first visit each board pulses once, then stays
 * calm. Clicking it opens the close-up (LandingControls.tsx), whose writing is
 * pinned onto the board's face.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { studioEnvironment } from "@/components/three/environment";
import { finishMaterial } from "@/components/three/finishes";
import { letteringGeometry, useLetteringFont } from "@/components/three/lettering";
import { PALETTE } from "@/components/three/palette";

import { useBuilding } from "../BuildingProvider";
import { useCanTouch, usePointing } from "../scene/Interactive";
import { Box, Scribbles } from "../scene/parts";
import { ScreenAnchor } from "../scene/ScreenAnchor";
import { reducedMotion, skyLook } from "../sky/look";
import { POSTER_COPY, type Poster } from "./copy";
import { BOARD, LANDING_ACTIONS, POSTERS } from "./layout";

const FRAME = 0.06;
const POST = { size: 0.09, height: BOARD.bottom + BOARD.height + 0.18 } as const;
const TITLE_SIZE = 0.2;
/** The paper's glow: at night, and when pointed at or pulsing. */
const GLOW = { night: 0.22, hover: 0.18, pulse: 0.35 } as const;
const LIFT = 0.05;
/** The first-visit pulse: when it starts after the board appears, how long it lasts, and the second board's lag (s). */
const PULSE = { delay: 1.6, length: 1.4, stagger: 0.5 } as const;
const SEEN_KEY = "jobme.posters.seen";
const HIT_SCALE = 1.8;

const hitGeometry = new THREE.BoxGeometry((BOARD.width + 0.3) * HIT_SCALE, POST.height * 1.2, 0.6);
const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });

/** Each board's own paper, so one can glow on its own (the shared "paper" finish mustn't change). */
function paperMaterial(gl: THREE.WebGLRenderer): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: PALETTE.paper,
    roughness: 0.95,
    emissive: "#fff3dc",
    emissiveIntensity: 0,
    envMap: studioEnvironment(gl),
    envMapIntensity: 0.25,
  });
}

function seenBefore(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // can't remember it, so don't pulse every visit
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Nothing to do.
  }
}

export function PosterStand({ poster, order }: { poster: Poster; order: number }) {
  const gl = useThree((s) => s.gl);
  const font = useLetteringFont();
  const building = useBuilding();
  const invalidate = useThree((s) => s.invalidate);
  const canTouch = useCanTouch("street") && building?.focus === null;
  const action = LANDING_ACTIONS.poster(poster);
  const { hovered, bind } = usePointing(action, canTouch);
  useEffect(() => invalidate(), [hovered, invalidate]);

  const paper = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>>(null);
  const board = useRef<THREE.Group>(null);
  const hover = useRef(0);
  /** The first-visit pulse's start (clock seconds), or null for none. */
  const pulseAt = useRef<number | null>(null);
  const clock = useThree((s) => s.clock);

  useEffect(() => {
    if (seenBefore() || reducedMotion()) return;
    pulseAt.current = clock.elapsedTime + PULSE.delay + order * PULSE.stagger;
    // Seen once it has been shown, whichever board runs this last.
    const timer = window.setTimeout(markSeen, (PULSE.delay + PULSE.stagger + PULSE.length) * 1000);
    return () => window.clearTimeout(timer);
  }, [clock, order]);

  const paperFace = useMemo(() => paperMaterial(gl), [gl]);
  useEffect(() => () => paperFace.dispose(), [paperFace]);

  useFrame(({ clock: c }, delta) => {
    const goal = hovered ? 1 : 0;
    hover.current += (goal - hover.current) * (1 - Math.exp(-Math.min(delta, 0.1) * 10));
    if (Math.abs(goal - hover.current) > 1e-3) invalidate();
    let pulse = 0;
    const start = pulseAt.current;
    if (start !== null) {
      const p = (c.elapsedTime - start) / PULSE.length;
      if (p >= 1) pulseAt.current = null;
      else if (p > 0) pulse = Math.sin(p * Math.PI);
      invalidate();
    }
    if (paper.current) {
      paper.current.material.emissiveIntensity = GLOW.night * skyLook.value.lamp + GLOW.hover * hover.current + GLOW.pulse * pulse;
    }
    if (board.current) {
      board.current.position.y = LIFT * Math.max(hover.current, pulse);
      board.current.scale.setScalar(1 + 0.04 * pulse);
    }
  });

  const place = POSTERS[poster];
  const title = letteringGeometry(font, { text: POSTER_COPY[poster].title.toUpperCase(), size: TITLE_SIZE, depth: 0.012, anchor: "surface" });
  const centreY = BOARD.bottom + BOARD.height / 2;
  const top = BOARD.bottom + BOARD.height;
  return (
    <group position={[place.x, 0, place.z]} rotation={[0, place.turn, 0]}>
      {/* Two posts with caps, and a crossbar under the board. */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box size={[POST.size, POST.height, POST.size]} at={[side * (BOARD.width / 2 + FRAME + POST.size / 2), POST.height / 2, 0]} finish="wood" cast />
          <Box size={[POST.size + 0.04, 0.05, POST.size + 0.04]} at={[side * (BOARD.width / 2 + FRAME + POST.size / 2), POST.height + 0.025, 0]} finish="trim" round={0.01} cast />
        </group>
      ))}
      <Box size={[BOARD.width + FRAME * 2, 0.06, 0.06]} at={[0, BOARD.bottom - FRAME - 0.08, 0]} finish="wood" cast />

      <group ref={board}>
        {/* The frame, the paper, the title and a few lines of "writing". */}
        <Box size={[BOARD.width + FRAME * 2, BOARD.height + FRAME * 2, 0.05]} at={[0, centreY, -0.01]} finish="wood" round={0.01} cast />
        <mesh ref={paper} position={[0, centreY, 0.02]} receiveShadow material={paperFace}>
          <planeGeometry args={[BOARD.width, BOARD.height]} />
        </mesh>
        <mesh geometry={title} material={finishMaterial(gl, "ink", { decal: true })} position={[0, top - 0.22, 0.021]} />
        <Box size={[BOARD.width * 0.6, 0.02, 0.006]} at={[0, top - 0.38, 0.024]} finish="accent" />
        <Scribbles at={[-BOARD.width * 0.36, top - 0.55, 0.024]} widths={[0.9, 0.78, 0.86, 0.5]} gap={0.11} />
        {/* Where the close-up's writing is pinned. */}
        <group position={[0, centreY, 0.03]}>
          <ScreenAnchor name={`poster:${poster}`} width={BOARD.width} height={BOARD.height} />
        </group>
      </group>

      <mesh
        geometry={hitGeometry}
        material={hitMaterial}
        position={[0, POST.height * 0.55, 0]}
        {...bind}
        onClick={(e) => {
          e.stopPropagation();
          if (canTouch) building?.activate(action);
        }}
      />
    </group>
  );
}
