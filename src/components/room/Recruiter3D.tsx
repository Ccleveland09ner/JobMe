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
 *   - thinking   eyes up, brows lifted, a slight head tilt
 *   - always     a blink every 3–6s; the idle clip (Mixamo) when the model
 *                carries one
 * Reduced motion: mouth only — no blink, nod, tilt or idle clip.
 *
 * All the per-frame three.js work lives in RecruiterRig, a plain class held
 * in a ref: three.js is imperative (it mutates its scene graph every frame),
 * and keeping that out of React's render data is what the React Compiler's
 * immutability rules ask for.
 *
 * Loaded only in the browser (RecruiterStage imports this with
 * `ssr: false`), and only when WebGL is available; the SVG recruiter covers
 * every other case.
 */

import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js";

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

/** Theme tokens (globals.css) — WebGL cannot read CSS variables. */
const INK = new THREE.Color("#1c1b1a");
const TEAL = new THREE.Color("#0f766e");

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
const NOD_RADIANS = 0.12;
const BLINK_SECONDS = 0.14;

/** Three flat tones instead of smooth lighting: the "illustrated" look. */
function toonGradient(): THREE.DataTexture {
  const steps = [150, 210, 255];
  const data = new Uint8Array(steps.flatMap((v) => [v, v, v, 255]));
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Everything imperative about the recruiter, outside React. */
class RecruiterRig {
  private readonly outline: OutlineEffect;
  private readonly morphMeshes: THREE.Mesh[] = [];
  private readonly head: THREE.Object3D | null;
  private readonly headRest: THREE.Quaternion | null;
  private readonly mixer: THREE.AnimationMixer | null = null;
  private readonly values = Object.fromEntries(MORPHS.map((m) => [m, 0])) as Record<Morph, number>;
  private framedFor = "";
  private nextBlink = 0;
  private blinkStart = -1;
  private nodStart = -1;
  private tilt = 0;
  private lastState: RecruiterState | null = null;

  constructor(
    gl: THREE.WebGLRenderer,
    private readonly scene: THREE.Object3D,
    clips: THREE.AnimationClip[],
    private readonly reduced: boolean,
  ) {
    this.outline = new OutlineEffect(gl, { defaultThickness: 0.004, defaultColor: [INK.r, INK.g, INK.b] });
    this.restyle();

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
    this.head = scene.getObjectByName("Head") ?? null;
    this.headRest = this.head ? this.head.quaternion.clone() : null;
  }

  private restyle() {
    const gradientMap = toonGradient();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false; // skinned bounds lag the pose; never pop out
      if (mesh.morphTargetDictionary) this.morphMeshes.push(mesh);
      const old = mesh.material as THREE.MeshStandardMaterial;
      const isGlasses = old.name === "Wolf3D_Glasses";
      mesh.material = new THREE.MeshToonMaterial({
        name: old.name,
        map: isGlasses ? null : old.map,
        // Keep the material colour: the compressor folds 1px colour textures
        // (hair, skin) into it, so a plain white would bleach them.
        color: isGlasses ? TEAL : old.color.clone(),
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
    width: number,
    height: number,
    delta: number,
    state: RecruiterState,
    readMouth: (() => number | null) | undefined,
  ) {
    const now = performance.now() / 1000;
    const v = this.values;
    const approach = (m: Morph, target: number, rate: number) =>
      (v[m] += (target - v[m]) * (1 - Math.exp(-delta * rate)));

    if (state === "listening" && this.lastState !== "listening" && !this.reduced) this.nodStart = now;
    this.lastState = state;

    this.mixer?.update(delta);
    this.frame(camera, width, height);

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

    // Thinking: eyes up, brows lifted, a slight tilt.
    const thinking = state === "thinking" && !this.reduced;
    approach("eyesLookUp", thinking ? 0.35 : 0, 6);
    approach("browInnerUp", thinking ? 0.3 : 0, 6);
    this.tilt += ((thinking ? 0.07 : 0) - this.tilt) * (1 - Math.exp(-delta * 4));

    for (const mesh of this.morphMeshes) {
      const dict = mesh.morphTargetDictionary!;
      const influences = mesh.morphTargetInfluences!;
      for (const m of MORPHS) {
        const i = dict[m];
        if (i !== undefined) influences[i] = v[m];
      }
    }

    // Head: from the clip's pose (or rest), plus the nod and the tilt.
    if (this.head) {
      if (!this.mixer && this.headRest) this.head.quaternion.copy(this.headRest);
      const t = now - this.nodStart;
      const nod = this.nodStart >= 0 && t < NOD_SECONDS ? Math.sin((Math.PI * t) / NOD_SECONDS) * NOD_RADIANS : 0;
      if (nod) this.head.rotateX(nod);
      if (this.tilt) this.head.rotateZ(this.tilt);
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.outline.render(scene, camera);
  }
}

function Recruiter({ state, readMouth, onReady }: Recruiter3DProps) {
  const { scene, animations } = useGLTF(RECRUITER_MODEL);
  const rig = useRef<RecruiterRig | null>(null);
  const reported = useRef(false);

  // The frame loop reads the latest props through refs, so a state change
  // never re-creates the rig or restarts the idle clip.
  const latest = useRef({ state, readMouth, onReady });
  useEffect(() => {
    latest.current = { state, readMouth, onReady };
  });

  // Priority 1 takes over rendering: the outline effect draws the scene.
  useFrame(({ gl, scene: root, camera, size }, delta) => {
    rig.current ??= new RecruiterRig(gl, scene, animations, prefersReducedMotion());
    const p = latest.current;
    rig.current.update(camera as THREE.PerspectiveCamera, size.width, size.height, delta, p.state, p.readMouth);
    rig.current.render(root, camera);
    if (!reported.current) {
      reported.current = true;
      p.onReady?.();
    }
  }, 1);

  return <primitive object={scene} />;
}

export default function Recruiter3D(props: Recruiter3DProps) {
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
      <Recruiter {...props} />
    </Canvas>
  );
}

useGLTF.preload(RECRUITER_MODEL);
