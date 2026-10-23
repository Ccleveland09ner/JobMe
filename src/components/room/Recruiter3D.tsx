"use client";

/**
 * The 3D recruiter (public/models/recruiter.glb) in React; recruiterRig.ts
 * moves it. <RecruiterModel> is the character alone, for the building's
 * scene; the default export is a self-contained canvas framing the bust.
 */

import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, type ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import { OutlineRenderer } from "@/components/three/OutlineRenderer";
import { studioEnvironment } from "@/components/three/environment";
import { prefersReducedMotion } from "@/lib/frontend/motion";
import type { VisemeWeights } from "@/lib/voice/lipsync";

import { RecruiterRig } from "./recruiterRig";
import type { Look, RecruiterState, Speaker } from "./types";

export const RECRUITER_MODEL = "/models/recruiter.glb";

export interface Recruiter3DProps {
  state: RecruiterState;
  /** Live mouth openness 0..1, or null when no audio signal is available. */
  readMouth?: () => number | null;
  /** Live mouth shapes from the lip-sync timeline, or null without one. */
  readVisemes?: () => VisemeWeights | null;
  /** Called once the model is loaded and has drawn its first frame. */
  onReady?: () => void;
}

/** Frame rate a character requests while animating (the camera still runs at full rate). */
const MODEL_FPS = 30;

export type RecruiterModelProps = Omit<ThreeElements["group"], "ref"> & {
  /** Read every frame; mutate `.current` to change state without re-rendering. */
  speaker: { current: Speaker };
  /** Frame the bust in the camera, as the standalone canvas does. */
  framesCamera?: boolean;
  /** Draw a frame every frame (for frameloop="demand" canvases). */
  animate?: boolean;
  look?: Look;
  /** Called once the model is loaded and has drawn its first frame. */
  onReady?: () => void;
};

/** The character alone, as a node in a scene that owns camera and outline. */
export function RecruiterModel({ speaker, framesCamera = false, animate = true, look, onReady, ...group }: RecruiterModelProps) {
  const { scene: source, animations } = useGLTF(RECRUITER_MODEL);
  // useGLTF shares one cached scene; each character needs its own skeleton.
  const scene = useMemo(() => cloneSkinned(source), [source]);
  const rig = useRef<RecruiterRig | null>(null);
  const reported = useRef(false);
  const latest = useRef({ look, onReady });
  useEffect(() => {
    latest.current = { look, onReady };
  });
  // The next requested frame, at most MODEL_FPS a second (TalkingHead's modelFPS).
  const nextFrame = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (nextFrame.current) clearTimeout(nextFrame.current);
      // The building's scene outlives the character: let go of what its rig made.
      rig.current?.dispose();
      rig.current = null;
    },
    [],
  );

  useFrame(({ gl, camera, size, invalidate }, delta) => {
    rig.current ??= new RecruiterRig(scene, animations, prefersReducedMotion(), latest.current.look, studioEnvironment(gl));
    rig.current.update(camera as THREE.PerspectiveCamera, framesCamera ? size : null, delta, speaker.current);
    if (animate && nextFrame.current === null) {
      nextFrame.current = setTimeout(() => {
        nextFrame.current = null;
        invalidate();
      }, 1000 / MODEL_FPS);
    }
    if (!reported.current) {
      reported.current = true;
      latest.current.onReady?.();
    }
  });

  return (
    <group {...group}>
      <primitive object={scene} />
    </group>
  );
}

/** The bust in its own canvas: RecruiterStage outside the building. */
export default function Recruiter3D({ state, readMouth, readVisemes, onReady }: Recruiter3DProps) {
  // Read through a ref, so a state change never re-creates the rig.
  const speaker = useRef<Speaker>({ state, readMouth, readVisemes });
  useEffect(() => {
    speaker.current = { state, readMouth, readVisemes };
  });

  return (
    <Canvas
      // `flat`: no tone mapping, so the toon tones keep the palette's values.
      flat
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ fov: 22, near: 0.1, far: 20 }}
      aria-hidden="true"
    >
      <hemisphereLight args={[0xffffff, 0xd8d2c8, 1.2]} />
      <directionalLight position={[1.5, 2.5, 2.5]} intensity={1.6} color={0xfff4e6} />
      <RecruiterModel speaker={speaker} framesCamera onReady={onReady} />
      <OutlineRenderer />
    </Canvas>
  );
}

useGLTF.preload(RECRUITER_MODEL);
