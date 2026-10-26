"use client";

/**
 * A stone signpost beside the path, in the building's own stone and trim: a
 * stepped plinth, a slab with a recessed face in a trim frame, and a chamfered
 * cap, turned a little toward the street. Its name hovers above it in the
 * reception style (ABOUT US, GUIDE); that is what opens it. Pointing at the
 * name brightens it and warms the stone; a first visit draws the eye once.
 * At dusk and night a faint warm uplight keeps the stone readable.
 *
 * Opened, the writing is pinned onto the face (LandingControls.tsx), and
 * CLOSE, and NEXT or BACK, hover beside it; on a portrait screen NEXT or BACK
 * move below the face.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

import { finishMaterial } from "@/components/three/finishes";

import { useBuilding } from "../BuildingProvider";
import { HoverLabel } from "../scene/HoverLabel";
import { useCanTouch, usePointing } from "../scene/Interactive";
import { Box } from "../scene/parts";
import { ScreenAnchor } from "../scene/ScreenAnchor";
import { roundedSlab } from "../scene/shapes";
import { reducedMotion, skyLook } from "../sky/look";
import { useCanvasTexture, type CanvasArt } from "../sky/textures";
import { LABELS, POSTER_COPY, type Poster } from "./copy";
import { FACE, LANDING_ACTIONS, PORTRAIT, POSTS } from "./layout";
import { useSignPostView } from "./useSignPostNavigation";

const SLAB = { width: FACE.width + 0.3, depth: 0.34 } as const;
/** The plinth's two steps, bottom up: height, and how far past the slab each reaches. */
const STEPS = [
  { height: 0.18, over: 0.25, finish: "trim" },
  { height: 0.16, over: 0.12, finish: "stone" },
] as const;
const PLINTH_TOP = STEPS[0].height + STEPS[1].height;
const CAP = { height: 0.12, over: 0.06, chamfer: 0.08, inset: 0.08 } as const;
const FRAME = { width: 0.06, depth: 0.03 } as const;

const TITLE = { size: 0.24, lift: 0.5, arrow: 1.4 } as const;
const WORDS = { size: 0.085, gap: 0.2 } as const;
const HIT = 1.8;
const WARM = "#ffcf8f";
/** The uplight's strength: at night, and on top when pointed at or pulsing. */
const UPLIGHT = { night: 0.32, hover: 0.18, pulse: 0.25 } as const;
/** The first-visit pulse: when it starts, how long it lasts, and the second post's lag (s). */
const PULSE = { delay: 1.6, length: 1.4, stagger: 0.5 } as const;
const SEEN_KEY = "jobme.posters.seen";

const bodyGeometry = new THREE.BoxGeometry(SLAB.width, 1, SLAB.depth);
const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });

/** A warm wash up the stone from the ground: strongest low and in the middle. */
const UPLIGHT_ART: CanvasArt = {
  width: 64,
  height: 128,
  color: true,
  draw(ctx) {
    const up = ctx.createLinearGradient(0, 128, 0, 0);
    up.addColorStop(0, "rgba(255,255,255,0.9)");
    up.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = up;
    ctx.fillRect(0, 0, 64, 128);
    // Fade the sides out.
    ctx.globalCompositeOperation = "destination-in";
    const across = ctx.createLinearGradient(0, 0, 64, 0);
    across.addColorStop(0, "rgba(0,0,0,0)");
    across.addColorStop(0.5, "rgba(0,0,0,1)");
    across.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = across;
    ctx.fillRect(0, 0, 64, 128);
  },
};

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

export function SignPost({ poster, order }: { poster: Poster; order: number }) {
  const gl = useThree((s) => s.gl);
  const building = useBuilding();
  const invalidate = useThree((s) => s.invalidate);
  const clock = useThree((s) => s.clock);
  const portrait = useThree((s) => s.size.width / s.size.height < PORTRAIT);
  const view = useSignPostView();
  const touchable = useCanTouch("street");

  const titleAction = LANDING_ACTIONS.poster(poster);
  const title = usePointing(titleAction, touchable && view.open === null);
  const reading = touchable && view.open === poster && view.arrived;
  const close = usePointing(LANDING_ACTIONS.close, reading);
  const step = poster === "about" ? "next" : "back";
  const move = usePointing(LANDING_ACTIONS[step], reading);
  useEffect(() => invalidate(), [title.hovered, invalidate]);

  const uplightMap = useCanvasTexture(UPLIGHT_ART);
  const uplight = useRef<THREE.MeshBasicMaterial>(null);
  /** The first-visit pulse, 0 to 1, read by the title too. */
  const pulse = useRef(0);
  const pulseAt = useRef<number | null>(null);

  useEffect(() => {
    if (seenBefore() || reducedMotion()) return;
    pulseAt.current = clock.elapsedTime + PULSE.delay + order * PULSE.stagger;
    // Seen once it has been shown, whichever post runs this last.
    const timer = window.setTimeout(markSeen, (PULSE.delay + PULSE.stagger + PULSE.length) * 1000);
    return () => window.clearTimeout(timer);
  }, [clock, order]);

  const hover = useRef(0);
  useFrame(({ clock: c }, delta) => {
    const goal = title.hovered ? 1 : 0;
    hover.current += (goal - hover.current) * (1 - Math.exp(-Math.min(delta, 0.1) * 10));
    if (Math.abs(goal - hover.current) > 1e-3) invalidate();
    const start = pulseAt.current;
    pulse.current = 0;
    if (start !== null) {
      const p = (c.elapsedTime - start) / PULSE.length;
      if (p >= 1) pulseAt.current = null;
      else if (p > 0) pulse.current = Math.sin(p * Math.PI);
      invalidate();
    }
    if (uplight.current) {
      uplight.current.opacity = UPLIGHT.night * skyLook.value.lamp + UPLIGHT.hover * hover.current + UPLIGHT.pulse * pulse.current;
    }
  });

  const place = POSTS[poster];
  const slabTop = place.height - CAP.height - CAP.chamfer;
  const faceY = FACE.bottom + FACE.height / 2;
  const faceTop = FACE.bottom + FACE.height;
  const front = SLAB.depth / 2;
  const sideX = FACE.width / 2 + WORDS.gap;
  const moveAt: [number, number, number] = portrait
    ? [0, FACE.bottom - 0.13, front + 0.06]
    : [step === "next" ? sideX : -sideX, faceY, front + 0.1];
  // Beside the face's top right corner; just above it on a portrait screen, where there is no room beside.
  const closeAt: [number, number, number] = portrait ? [FACE.width / 2 - 0.25, faceTop + 0.12, front + 0.06] : [sideX, faceTop - 0.1, front + 0.1];

  return (
    <group position={[place.x, 0, place.z]} rotation={[0, place.turn, 0]}>
      {/* The stepped plinth. */}
      <Box size={[SLAB.width + STEPS[0].over * 2, STEPS[0].height, SLAB.depth + STEPS[0].over * 2]} at={[0, STEPS[0].height / 2, 0]} finish={STEPS[0].finish} round={0.015} cast />
      <Box
        size={[SLAB.width + STEPS[1].over * 2, STEPS[1].height, SLAB.depth + STEPS[1].over * 2]}
        at={[0, STEPS[0].height + STEPS[1].height / 2, 0]}
        finish={STEPS[1].finish}
        round={0.012}
        cast
      />
      {/* The slab, the trim frame round its face, and the chamfered cap. */}
      <Box size={[SLAB.width, slabTop - PLINTH_TOP, SLAB.depth]} at={[0, (slabTop + PLINTH_TOP) / 2, 0]} finish="stone" cast />
      <mesh
        geometry={roundedSlab({
          w: FACE.width + FRAME.width * 2,
          h: FACE.height + FRAME.width * 2,
          r: 0.02,
          depth: FRAME.depth,
          hole: { w: FACE.width, h: FACE.height, r: 0.01 },
        })}
        material={finishMaterial(gl, "trim")}
        position={[0, faceY, front]}
        castShadow
        receiveShadow
      />
      <Box size={[SLAB.width + CAP.over * 2, CAP.height, SLAB.depth + CAP.over * 2]} at={[0, slabTop + CAP.height / 2, 0]} finish="trim" round={0.015} cast />
      <Box
        size={[SLAB.width + CAP.over * 2 - CAP.inset * 2, CAP.chamfer, SLAB.depth + CAP.over * 2 - CAP.inset * 2]}
        at={[0, slabTop + CAP.height + CAP.chamfer / 2, 0]}
        finish="trim"
        round={0.03}
        cast
      />

      {/* A faint warm wash up the stone. */}
      <mesh position={[0, PLINTH_TOP + 0.65, front + FRAME.depth + 0.004]} renderOrder={1}>
        <planeGeometry args={[SLAB.width, 1.3]} />
        <meshBasicMaterial
          ref={uplight}
          map={uplightMap}
          color={WARM}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* The stone itself: clicking it is not clicking "outside" it. */}
      <mesh
        geometry={bodyGeometry}
        material={hitMaterial}
        position={[0, place.height / 2, 0]}
        scale={[1, place.height, 1]}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Where the writing is pinned when it is open. */}
      <group position={[0, faceY, front + 0.002]}>
        <ScreenAnchor name={`poster:${poster}`} width={FACE.width} height={FACE.height} />
      </group>

      <HoverLabel
        at={[0, place.height + TITLE.lift, 0.05]}
        lines={[POSTER_COPY[poster].title]}
        size={TITLE.size}
        depth={0.035}
        pointerSize={TITLE.arrow}
        hovered={title.hovered}
        bind={title.bind}
        visible={view.open === null}
        onClick={() => {
          if (touchable && view.open === null) building?.activate(titleAction);
        }}
        grow
        hitScale={HIT}
        minTapPx={44}
        pulse={pulse}
      />

      {/* Reading: CLOSE by the face's top corner, NEXT or BACK beside it (below it on a portrait screen). */}
      <HoverLabel
        at={closeAt}
        lines={[LABELS.close]}
        size={WORDS.size}
        align={portrait ? "center" : "left"}
        hovered={close.hovered}
        bind={close.bind}
        visible={reading}
        pointer={false}
        onClick={() => {
          if (reading) building?.activate(LANDING_ACTIONS.close);
        }}
        hitScale={1.4}
        minTapPx={44}
      />
      <HoverLabel
        at={moveAt}
        lines={[step === "next" ? LABELS.next : LABELS.back]}
        size={WORDS.size}
        align={portrait ? "center" : step === "next" ? "left" : "right"}
        hovered={move.hovered}
        bind={move.bind}
        visible={reading}
        pointer={false}
        onClick={() => {
          if (reading) building?.activate(LANDING_ACTIONS[step]);
        }}
        hitScale={1.4}
        minTapPx={44}
      />
    </group>
  );
}
