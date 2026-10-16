"use client";

/**
 * The 3D recruiter: public/models/recruiter.glb, rendered to read as an
 * illustration rather than a game character — flat toon shading, an ink
 * outline, the app's palette, and one teal accent (the glasses).
 * Ref: docs/PRD-JobMe-MVP.md > Look and Feel ("friendly and intentional, not
 *      photoreal"; one confident accent)
 *
 * The model is a Ready Player Me avatar re-dressed in a suit with
 * design/tools/dress_recruiter.py, then compressed (meshopt + WebP). It keeps
 * the full skeleton and the ARKit / viseme face shapes, which is what makes
 * it animatable:
 *   - speaking   jawOpen / mouthOpen / viseme_aa follow the voice level
 *                (the same readMouth() signal the SVG avatar uses)
 *   - listening  a nod as it starts
 *   - thinking   a glance up and to the side, brows lifted
 *   - always     a blink every 3–6s; the idle clip (Mixamo) when the model
 *                carries one
 * Eye contact: the head is aimed at the camera (the candidate) every frame;
 * the clip moves the body, never the gaze. See aimHead().
 * Reduced motion: mouth only — no blink, nod, glance or idle clip.
 *
 * All the per-frame three.js work lives in RecruiterRig, a plain class held
 * in a ref: three.js is imperative (it mutates its scene graph every frame),
 * and keeping that out of React's render data is what the React Compiler's
 * immutability rules ask for.
 *
 * Two ways in:
 *   - <RecruiterModel> is the character alone, a node in someone else's
 *     scene: the building (components/building) seats it in the interview
 *     room and the secretary behind the front desk. The scene owns the
 *     camera and the one ink-outline pass (three/OutlineRenderer.tsx).
 *   - The default export is a self-contained <Canvas> that frames the bust,
 *     for RecruiterStage outside the building and /dev/recruiter.
 *
 * The model must stay unrotated: eye contact assumes it faces world +Z.
 *
 * Loaded only in the browser (imported with `ssr: false`), and only when
 * WebGL is available; the SVG recruiter covers every other case.
 */

import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, type ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import { OutlineRenderer } from "@/components/three/OutlineRenderer";
import { TEAL, toonGradient } from "@/components/three/toon";
import { prefersReducedMotion } from "@/lib/voice/audio-graph";

export const RECRUITER_MODEL = "/models/recruiter.glb";

export type RecruiterState = "idle" | "listening" | "thinking" | "speaking";

export interface Recruiter3DProps {
  state: RecruiterState;
  /** Live mouth openness 0..1, or null when no audio signal is available. */
  readMouth?: () => number | null;
  /** Called once the model is loaded and has drawn its first frame. */
  onReady?: () => void;
}

/** What drives the face, read every frame without re-rendering React. */
export interface Speaker {
  state: RecruiterState;
  readMouth?: () => number | null;
}

/**
 * Recolouring, so one model can play more than one person. Colours replace
 * a material's base colour by material name; the textures stay.
 */
export interface Look {
  colors?: Record<string, string>;
  glasses?: boolean;
}

/** Morph targets driven every frame, on every mesh that has them. */
const MORPHS = [
  "jawOpen",
  "mouthOpen",
  "viseme_aa",
  "mouthSmile",
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "eyesLookUp",
  "browInnerUp",
] as const;
type Morph = (typeof MORPHS)[number];

const NOD_SECONDS = 0.5;
/** How far the gaze dips during the nod, in metres at the camera (~7°). */
const NOD_DROP = 0.25;
const BLINK_SECONDS = 0.14;

/** The model faces +Z, toward the camera. */
const FORWARD = new THREE.Vector3(0, 0, 1);
const IDENTITY = new THREE.Quaternion();
/** Thinking: a glance up and to one side, in metres at the camera. */
const THINKING_GAZE = new THREE.Vector3(0.3, 0.3, 0);
const NO_OFFSET = new THREE.Vector3();
/** The furthest the head turns toward a target (~20°). */
const MAX_HEAD_TURN = 0.35;

/** Reused every frame, so aiming the head allocates nothing. */
const scratch = {
  from: new THREE.Vector3(),
  eye: new THREE.Vector3(),
  target: new THREE.Vector3(),
  look: new THREE.Quaternion(),
  desired: new THREE.Quaternion(),
  parent: new THREE.Quaternion(),
};

/** Everything imperative about the recruiter, outside React. */
class RecruiterRig {
  private readonly morphMeshes: THREE.Mesh[] = [];
  private readonly head: THREE.Object3D | null;
  private readonly neck: THREE.Object3D | null;
  private readonly eyes: THREE.Object3D[];
  /** Upright, facing forward: the bind pose, before any clip moves it. */
  private readonly headRestWorld = new THREE.Quaternion();
  private readonly neckRestLocal = new THREE.Quaternion();
  private readonly mixer: THREE.AnimationMixer | null = null;
  private readonly values = Object.fromEntries(MORPHS.map((m) => [m, 0])) as Record<Morph, number>;
  private framedFor = "";
  private nextBlink = 0;
  private blinkStart = -1;
  private nodStart = -1;
  /** Where the gaze sits relative to the camera, eased (thinking glance). */
  private readonly gazeOffset = new THREE.Vector3();
  private lastState: RecruiterState | null = null;

  constructor(
    private readonly scene: THREE.Object3D,
    clips: THREE.AnimationClip[],
    private readonly reduced: boolean,
    look: Look = {},
  ) {
    this.restyle(look);

    // Read the bind pose before the clip moves anything: it is the one pose
    // where the head is known to be upright and facing straight ahead.
    scene.updateMatrixWorld(true);
    this.head = scene.getObjectByName("Head") ?? null;
    this.neck = scene.getObjectByName("Neck") ?? null;
    this.eyes = ["LeftEye", "RightEye"].flatMap((n) => scene.getObjectByName(n) ?? []);
    this.head?.getWorldQuaternion(this.headRestWorld);
    if (this.neck) this.neckRestLocal.copy(this.neck.quaternion);

    if (clips.length) {
      // The idle clip (Mixamo, baked in by design/tools). Under reduced
      // motion it holds its first frame: seated, but still.
      this.mixer = new THREE.AnimationMixer(scene);
      const action = this.mixer.clipAction(clips[0]);
      action.play();
      if (reduced) action.paused = true;
    } else {
      // No clip: lower the A-pose arms to the sides. The desk in front
      // hides everything below the chest.
      scene.getObjectByName("LeftArm")?.rotateZ(0.45);
      scene.getObjectByName("RightArm")?.rotateZ(-0.45);
    }
    this.mixer?.update(0);
    scene.updateMatrixWorld(true);
  }

  private restyle({ colors = {}, glasses = true }: Look) {
    const gradientMap = toonGradient();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false; // skinned bounds lag the pose; never pop out
      if (mesh.morphTargetDictionary) this.morphMeshes.push(mesh);
      const old = mesh.material as THREE.MeshStandardMaterial;
      const isGlasses = old.name === "Wolf3D_Glasses";
      if (isGlasses && !glasses) mesh.visible = false;
      const recolor = colors[old.name];
      mesh.material = new THREE.MeshToonMaterial({
        name: old.name,
        map: isGlasses ? null : old.map,
        // Keep the material colour: the compressor folds 1px colour textures
        // (hair, skin) into it, so a plain white would bleach them.
        color: recolor ? new THREE.Color(recolor) : isGlasses ? TEAL : old.color.clone(),
        gradientMap,
        transparent: old.transparent,
        alphaTest: old.alphaTest,
        side: old.side,
      });
    });
  }

  /** Frame the bust as the SVG room does: head above centre, desk across the chest. */
  private frame(camera: THREE.PerspectiveCamera, width: number, height: number) {
    const key = `${width}x${height}`;
    if (this.framedFor === key || !this.head) return;
    this.framedFor = key;
    const at = new THREE.Vector3();
    this.head.getWorldPosition(at);
    camera.fov = 22;
    camera.aspect = width / height;
    camera.position.set(at.x, at.y - 0.05, at.z + 2.1);
    camera.lookAt(at.x, at.y - 0.12, at.z);
    camera.updateProjectionMatrix();
  }

  update(
    camera: THREE.PerspectiveCamera,
    /** Viewport size when this rig frames the camera itself; null when the scene owns it. */
    framing: { width: number; height: number } | null,
    delta: number,
    { state, readMouth }: Speaker,
  ) {
    const now = performance.now() / 1000;
    const v = this.values;
    const approach = (m: Morph, target: number, rate: number) =>
      (v[m] += (target - v[m]) * (1 - Math.exp(-delta * rate)));

    if (state === "listening" && this.lastState !== "listening" && !this.reduced) this.nodStart = now;
    this.lastState = state;

    this.mixer?.update(delta);
    if (framing) this.frame(camera, framing.width, framing.height);

    // Mouth: the live voice level, or a gentle rhythm when there is none.
    let mouth = 0;
    if (state === "speaking") {
      const level = readMouth?.() ?? null;
      mouth = level !== null && level > 0.02 ? level : 0.3 + 0.35 * Math.abs(Math.sin(now * 8.3));
      if (this.reduced) mouth = Math.min(mouth, 0.45);
    }
    approach("jawOpen", mouth * 0.45, 30);
    approach("mouthOpen", mouth * 0.5, 30);
    approach("viseme_aa", mouth * 0.4, 30);
    approach("mouthSmile", state === "speaking" ? 0.2 : 0.4, 18);

    // Blink every 3-6s.
    let blink = 0;
    if (!this.reduced) {
      if (this.nextBlink === 0) this.nextBlink = now + 3 + Math.random() * 3;
      if (now >= this.nextBlink) {
        this.blinkStart = now;
        this.nextBlink = now + 3 + Math.random() * 3;
      }
      const t = now - this.blinkStart;
      if (this.blinkStart >= 0 && t < BLINK_SECONDS) blink = Math.sin((Math.PI * t) / BLINK_SECONDS);
    }
    v.eyeBlinkLeft = v.eyeBlinkRight = blink;

    // Thinking: a glance up and to the side, brows lifted.
    const thinking = state === "thinking" && !this.reduced;
    approach("eyesLookUp", thinking ? 0.25 : 0, 6);
    approach("browInnerUp", thinking ? 0.3 : 0, 6);
    this.gazeOffset.lerp(thinking ? THINKING_GAZE : NO_OFFSET, 1 - Math.exp(-delta * 3));

    for (const mesh of this.morphMeshes) {
      const dict = mesh.morphTargetDictionary!;
      const influences = mesh.morphTargetInfluences!;
      for (const m of MORPHS) {
        const i = dict[m];
        if (i !== undefined) influences[i] = v[m];
      }
    }

    const t = now - this.nodStart;
    const nod = this.nodStart >= 0 && t < NOD_SECONDS ? Math.sin((Math.PI * t) / NOD_SECONDS) : 0;
    this.aimHead(camera, nod);
  }

  /**
   * Eye contact. The clip keeps the body breathing and swaying, but its
   * neck and head angles (a relaxed sitter's, looking slightly up and
   * tilted) are replaced: the neck is held straight on the spine, and the
   * head turns from its upright rest pose to face the camera — the
   * candidate. The nod and the thinking glance move WHERE she looks rather
   * than adding raw bone rotations, so they cannot fight the clip.
   */
  private aimHead(camera: THREE.Camera, nod: number) {
    const head = this.head;
    if (!head?.parent) return;
    if (this.neck) this.neck.quaternion.copy(this.neckRestLocal);
    head.parent.updateWorldMatrix(true, false);
    head.updateWorldMatrix(false, true);

    // Aim from between the eyes; the head bone itself sits at the skull base.
    const from = scratch.from.set(0, 0, 0);
    if (this.eyes.length) {
      for (const eye of this.eyes) from.add(eye.getWorldPosition(scratch.eye));
      from.divideScalar(this.eyes.length);
    } else {
      head.getWorldPosition(from);
    }
    const target = scratch.target.copy(camera.position).add(this.gazeOffset);
    target.y -= nod * NOD_DROP;
    const dir = target.sub(from).normalize();

    // Turn from straight ahead toward the camera, but never further than a
    // person comfortably would without moving their shoulders.
    const look = scratch.look.setFromUnitVectors(FORWARD, dir);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(look.w)));
    if (angle > MAX_HEAD_TURN) look.slerp(IDENTITY, 1 - MAX_HEAD_TURN / angle);

    const desired = scratch.desired.copy(look).multiply(this.headRestWorld);
    const parentWorld = head.parent.getWorldQuaternion(scratch.parent);
    head.quaternion.copy(parentWorld.invert().multiply(desired));
  }

}

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
  // useGLTF hands every caller the same cached scene; two people in one
  // building need their own skeletons.
  const scene = useMemo(() => cloneSkinned(source), [source]);
  const rig = useRef<RecruiterRig | null>(null);
  const reported = useRef(false);
  const latest = useRef({ look, onReady });
  useEffect(() => {
    latest.current = { look, onReady };
  });

  useFrame(({ camera, size, invalidate }, delta) => {
    rig.current ??= new RecruiterRig(scene, animations, prefersReducedMotion(), latest.current.look);
    rig.current.update(camera as THREE.PerspectiveCamera, framesCamera ? size : null, delta, speaker.current);
    if (animate) invalidate();
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
export default function Recruiter3D({ state, readMouth, onReady }: Recruiter3DProps) {
  // The frame loop reads the latest props through this ref, so a state
  // change never re-creates the rig or restarts the idle clip.
  const speaker = useRef<Speaker>({ state, readMouth });
  useEffect(() => {
    speaker.current = { state, readMouth };
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
