"use client";

/**
 * Things in the building the user can touch.
 *
 *   <Clickable>  stays where it is: hovering lifts it a touch, clicking runs
 *                its action (the settings notice board).
 *   <Liftable>   can be picked up (heldMachine.ts): clicking runs its action,
 *                which asks the page to hold it; while held it travels to just
 *                in front of the camera, turned to face the user, then hides
 *                as its DOM self takes over. Put down, it travels back.
 *
 * Both only respond at their own station, with nothing in hand and nothing
 * moving — so two objects can never animate against each other. Their
 * actions are the same ones their hidden keyboard twins run (StationLayer,
 * the room), so a click on the object and Enter on its twin are one thing.
 *
 * Pointing is shared (building.hovered, by action name): the object, its
 * floating name (FloatingLabel.tsx) and the secretary's glance all follow
 * the same value, and keyboard focus on a twin sets it too.
 *
 * Reduced motion: the object jumps instead of travelling.
 */

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";

import { prefersReducedMotion } from "@/lib/voice/audio-graph";

import { useBuilding } from "../BuildingProvider";
import type { Held } from "../heldMachine";
import type { Station } from "../stations";

type Vec3 = [number, number, number];

const HOVER_SCALE = 1.06;
const LIFT_SECONDS = 0.55;
/** How far in front of the camera a held object stops, in metres. */
const HOLD_DISTANCE = 0.7;

export function useCanTouch(station: Station): boolean {
  const building = useBuilding();
  if (!building) return false;
  const { state, held } = building;
  return state.station === station && state.target === null && held.phase === "resting";
}

/**
 * Pointer handlers that point at `name` (or stop pointing at it), and
 * whether it is being pointed at — by the pointer or by keyboard focus.
 */
export function usePointing(name: string, canTouch: boolean) {
  const building = useBuilding();
  const hovered = canTouch && building?.hovered === name;
  const setHovered = building?.setHovered;
  return {
    hovered,
    bind: {
      onPointerOver: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (canTouch) setHovered?.(name);
      },
      onPointerOut: () => {
        if (building?.hovered === name) setHovered?.(null);
      },
    },
  };
}

/** Lean a pointed-at object toward the viewer a little, eased. */
function useLean(target: React.RefObject<THREE.Group | null>, on: boolean, scale: number) {
  const invalidate = useThree((st) => st.invalidate);
  useEffect(() => {
    invalidate();
  }, [on, invalidate]);
  useFrame((_, delta) => {
    const g = target.current;
    if (!g) return;
    const goal = on ? scale : 1;
    const next = g.scale.x + (goal - g.scale.x) * (1 - Math.exp(-delta * 12));
    if (Math.abs(next - goal) < 1e-3) {
      if (g.scale.x !== goal) g.scale.setScalar(goal);
      return;
    }
    g.scale.setScalar(next);
    invalidate();
  });
}

export function Clickable({
  action,
  station,
  position,
  rotation,
  hoverScale = HOVER_SCALE,
  children,
}: {
  action: string;
  station: Station;
  position?: Vec3;
  rotation?: Vec3;
  /** 1: no lean (a big thing on a wall), its own lettering lights up instead. */
  hoverScale?: number;
  children: ReactNode;
}) {
  const building = useBuilding();
  const canTouch = useCanTouch(station);
  const { hovered, bind } = usePointing(action, canTouch);
  const lean = useRef<THREE.Group>(null);
  useLean(lean, hovered, hoverScale);
  return (
    <group
      ref={lean}
      position={position}
      rotation={rotation}
      {...bind}
      onClick={(e) => {
        e.stopPropagation();
        if (canTouch) building?.activate(action);
      }}
    >
      {children}
    </group>
  );
}

const scratch = {
  forward: new THREE.Vector3(),
  right: new THREE.Vector3(),
  up: new THREE.Vector3(),
  basis: new THREE.Matrix4(),
};

/**
 * Facing the camera: the object's top (+Y, a book's cover) toward the
 * viewer, its far edge (−Z) up, its right (+X) to the viewer's right.
 */
function facingCamera(camera: THREE.Camera, out: THREE.Quaternion): THREE.Quaternion {
  camera.getWorldDirection(scratch.forward);
  scratch.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  scratch.up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  scratch.basis.makeBasis(scratch.right, scratch.forward.clone().negate(), scratch.up.clone().negate());
  return out.setFromRotationMatrix(scratch.basis);
}

export function Liftable({
  name,
  action,
  station,
  position,
  rotation = [0, 0, 0],
  children,
}: {
  name: Held;
  action: string;
  station: Station;
  position: Vec3;
  rotation?: Vec3;
  children: ReactNode;
}) {
  const building = useBuilding();
  const canTouch = useCanTouch(station);
  const { hovered, bind } = usePointing(action, canTouch);
  const group = useRef<THREE.Group>(null);
  const lean = useRef<THREE.Group>(null);
  useLean(lean, hovered, HOVER_SCALE);
  const motion = useRef<{ tween: gsap.core.Tween | null; doing: "lift" | "return" | null }>({ tween: null, doing: null });
  const latest = useRef(building);
  useEffect(() => {
    latest.current = building;
  });

  // Where it rests, as a pose to travel from and back to.
  const rest = useRef({
    position: new THREE.Vector3(...position),
    quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
  });

  useEffect(() => () => void motion.current.tween?.kill(), []);

  // The canvas draws on demand: wake it whenever what is held changes, so the
  // frame loop below sees the new phase.
  const invalidate = useThree((st) => st.invalidate);
  const heldName = building?.held.held;
  const heldPhase = building?.held.phase;
  useEffect(() => {
    invalidate();
  }, [heldName, heldPhase, invalidate]);

  useFrame(({ camera, invalidate }) => {
    const g = group.current;
    const b = latest.current;
    if (!g || !b) return;
    const mine = b.held.held === name;
    const phase = b.held.phase;
    const m = motion.current;

    const travel = (doing: "lift" | "return", onDone: () => void) => {
      const fromPos = g.position.clone();
      const fromRot = g.quaternion.clone();
      const toPos =
        doing === "lift"
          ? camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(HOLD_DISTANCE).add(camera.position)
          : rest.current.position.clone();
      const toRot = doing === "lift" ? facingCamera(camera, new THREE.Quaternion()) : rest.current.quaternion.clone();
      const t = { v: 0 };
      m.doing = doing;
      g.visible = true;
      m.tween = gsap.to(t, {
        v: 1,
        duration: prefersReducedMotion() ? 0 : LIFT_SECONDS,
        ease: doing === "lift" ? "power2.out" : "power2.inOut",
        onUpdate: () => {
          g.position.lerpVectors(fromPos, toPos, t.v);
          g.quaternion.slerpQuaternions(fromRot, toRot, t.v);
          invalidate();
        },
        onComplete: () => {
          m.tween = null;
          m.doing = null;
          onDone();
          invalidate();
        },
      });
    };

    if (mine && phase === "lifting" && m.doing === null && g.visible && !b.cameraMoving.current) {
      travel("lift", () => {
        g.visible = false; // the DOM object takes over
        b.dispatchHeld({ type: "LIFTED" });
      });
    } else if (mine && phase === "returning" && m.doing === null && !g.visible) {
      travel("return", () => b.dispatchHeld({ type: "RETURNED" }));
    } else if (!mine && m.doing === null && !g.visible) {
      // Put down some other way (a reload, a lost context): just be back.
      g.visible = true;
      g.position.copy(rest.current.position);
      g.quaternion.copy(rest.current.quaternion);
    }
    // Waiting for the camera to settle, or moving: keep frames coming.
    if ((mine && phase === "lifting" && m.doing === null) || m.doing !== null) invalidate();
  });

  return (
    <group ref={group} position={position} rotation={rotation}>
      <group
        ref={lean}
        {...bind}
        onClick={(e) => {
          e.stopPropagation();
          if (canTouch) building?.activate(action);
        }}
      >
        {children}
      </group>
    </group>
  );
}
