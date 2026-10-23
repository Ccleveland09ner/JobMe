/**
 * The 3D recruiter's rig, outside React: restyles the model, plays its idle
 * clip, and each frame drives the mouth (lip-sync), blinks, a nod when
 * listening, a thinking glance, and the head aimed at the camera. Reduced
 * motion: mouth only. Keep the model unrotated (it faces +Z).
 */

import * as THREE from "three";

import { INK, toonGradient } from "@/components/three/toon";
import { VISEMES, openness, type VisemeWeights } from "@/lib/voice/lipsync";

import type { Look, RecruiterState, Speaker } from "./types";

/** How strongly the studio lighting (environment) lights a rendered character. */
const ENV_INTENSITY = 0.45;

/** The model's viseme shapes (silence has none). */
const SPEECH_SHAPES = VISEMES.filter((v) => v !== "sil").map((v) => `viseme_${v}` as const);

/** Morph targets driven every frame, on every mesh that has them. */
const MORPHS = [
  "jawOpen",
  "mouthOpen",
  ...SPEECH_SHAPES,
  "mouthSmile",
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "eyesLookUp",
  "browInnerUp",
] as const;
type Morph = (typeof MORPHS)[number];

/** How fast the mouth follows lip-sync shapes (already eased; this only smooths frames). */
const LIPSYNC_RATE = 40;

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
/** How quickly the head turns to a new target, per second (eased, never snapped). */
const HEAD_TURN_RATE = 6;
/** Idle glances: how long one lasts, and the range of gaps between them, in seconds. */
const GLANCE_SECONDS = 1.1;
const GLANCE_GAP: [number, number] = [2.5, 6];
/** Where idle glances go, in metres at the camera: down at the desk, or to either side. */
const GLANCES = [new THREE.Vector3(0.9, -0.9, 0), new THREE.Vector3(-1.1, -0.4, 0), new THREE.Vector3(1.3, 0.1, 0)];

/** Reused every frame, so aiming the head allocates nothing. */
const scratch = {
  from: new THREE.Vector3(),
  eye: new THREE.Vector3(),
  target: new THREE.Vector3(),
  look: new THREE.Quaternion(),
  desired: new THREE.Quaternion(),
  parent: new THREE.Quaternion(),
};

/**
 * Everything imperative about the recruiter, outside React. `look` is read
 * once, when the rig is built; dispose() lets go of what the rig made.
 */
export class RecruiterRig {
  private readonly morphMeshes: THREE.Mesh[] = [];
  private readonly head: THREE.Object3D | null;
  private readonly neck: THREE.Object3D | null;
  private readonly eyes: THREE.Object3D[];
  /** Upright, facing forward: the bind pose, before any clip moves it. */
  private readonly headRestWorld = new THREE.Quaternion();
  private readonly neckRestLocal = new THREE.Quaternion();
  private readonly mixer: THREE.AnimationMixer | null = null;
  /** The materials restyle() made; the textures in them are shared, so stay. */
  private readonly materials: THREE.Material[] = [];
  private readonly values = Object.fromEntries(MORPHS.map((m) => [m, 0])) as Record<Morph, number>;
  private framedFor = "";
  private nextBlink = 0;
  private blinkStart = -1;
  private nodStart = -1;
  /** Where the gaze sits relative to the camera, eased (thinking glance). */
  private readonly gazeOffset = new THREE.Vector3();
  private lastState: RecruiterState | null = null;
  /** The head's turn as last applied, eased toward each frame's target. */
  private headLocal: THREE.Quaternion | null = null;
  private readonly idleGlances: boolean;
  private nextGlance = 0;
  private glanceUntil = 0;
  private glance = NO_OFFSET;

  constructor(
    private readonly scene: THREE.Object3D,
    clips: THREE.AnimationClip[],
    private readonly reduced: boolean,
    look: Look = {},
    environment: THREE.Texture | null = null,
  ) {
    this.idleGlances = Boolean(look.idleGlances) && !reduced;
    this.restyle(look, environment);

    // The bind pose, before the clip moves it: head upright, facing ahead.
    scene.updateMatrixWorld(true);
    this.head = scene.getObjectByName("Head") ?? null;
    this.neck = scene.getObjectByName("Neck") ?? null;
    this.eyes = ["LeftEye", "RightEye"].flatMap((n) => scene.getObjectByName(n) ?? []);
    this.head?.getWorldQuaternion(this.headRestWorld);
    if (this.neck) this.neckRestLocal.copy(this.neck.quaternion);

    if (clips.length) {
      // The idle clip; reduced motion holds its first frame.
      this.mixer = new THREE.AnimationMixer(scene);
      const action = this.mixer.clipAction(clips[0]);
      action.play();
      if (reduced) action.paused = true;
    } else {
      // No clip: lower the A-pose arms.
      scene.getObjectByName("LeftArm")?.rotateZ(0.45);
      scene.getObjectByName("RightArm")?.rotateZ(-0.45);
    }
    this.mixer?.update(0);
    scene.updateMatrixWorld(true);
  }

  private restyle({ colors = {}, glasses = true, style = "rendered" }: Look, environment: THREE.Texture | null) {
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

      if (style === "rendered") {
        // Our own copy: useGLTF shares the source materials between clones.
        const material = old.clone();
        if (recolor) material.color.set(recolor);
        if (isGlasses) {
          // Black frames with a little sheen.
          material.map = null;
          material.color.copy(INK);
          material.metalness = 0;
          material.roughness = 0.5;
        }
        material.envMap = environment;
        material.envMapIntensity = ENV_INTENSITY;
        // No ink line on a rendered character.
        material.userData.outlineParameters = { visible: false };
        mesh.material = material;
        this.materials.push(material);
        return;
      }

      const toon = new THREE.MeshToonMaterial({
        name: old.name,
        map: isGlasses ? null : old.map,
        // Keep the colour: the compressor folds 1px textures (hair, skin) into it.
        color: recolor ? new THREE.Color(recolor) : isGlasses ? INK.clone() : old.color.clone(),
        gradientMap,
        transparent: old.transparent,
        alphaTest: old.alphaTest,
        side: old.side,
      });
      mesh.material = toon;
      this.materials.push(toon);
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
    { state, readMouth, readVisemes, lookAt }: Speaker,
  ) {
    const now = performance.now() / 1000;
    const v = this.values;
    const approach = (m: Morph, target: number, rate: number) =>
      (v[m] += (target - v[m]) * (1 - Math.exp(-delta * rate)));

    if (state === "listening" && this.lastState !== "listening" && !this.reduced) this.nodStart = now;
    this.lastState = state;

    this.mixer?.update(delta);
    if (framing) this.frame(camera, framing.width, framing.height);

    // Mouth: lip-sync shapes if any, else the voice's loudness, else at rest.
    const visemes = state === "speaking" ? (readVisemes?.() ?? null) : null;
    const damp = this.reduced ? 0.6 : 1;
    if (visemes) {
      for (const shape of SPEECH_SHAPES) {
        approach(shape, (visemes[shape.slice(7) as keyof VisemeWeights] ?? 0) * damp, LIPSYNC_RATE);
      }
      // A little jaw under the open vowels gives the shapes some depth.
      approach("jawOpen", openness(visemes) * 0.2 * damp, LIPSYNC_RATE);
      approach("mouthOpen", 0, LIPSYNC_RATE);
    } else {
      const level = state === "speaking" ? (readMouth?.() ?? 0) : 0;
      const mouth = (level > 0.02 ? level : 0) * damp;
      for (const shape of SPEECH_SHAPES) approach(shape, shape === "viseme_aa" ? mouth * 0.4 : 0, 30);
      approach("jawOpen", mouth * 0.45, 30);
      approach("mouthOpen", mouth * 0.5, 30);
    }
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
    this.aimHead(camera, nod, delta, now, lookAt ?? null);
  }

  /**
   * Eye contact: the clip moves the body, but the neck is held straight and
   * the head turns from its rest pose to the target. Nods and glances move
   * the target, so they never fight the clip.
   */
  private aimHead(camera: THREE.Camera, nod: number, delta: number, now: number, lookAt: readonly [number, number, number] | null) {
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
    // Idle glances, unless there's a point to look at.
    if (this.idleGlances && !lookAt) {
      if (this.nextGlance === 0) this.nextGlance = now + GLANCE_GAP[0];
      if (now >= this.nextGlance) {
        this.glance = GLANCES[Math.floor(Math.random() * GLANCES.length)];
        this.glanceUntil = now + GLANCE_SECONDS;
        this.nextGlance = now + GLANCE_SECONDS + GLANCE_GAP[0] + Math.random() * (GLANCE_GAP[1] - GLANCE_GAP[0]);
      }
    }
    const glancing = !lookAt && now < this.glanceUntil;
    const target = lookAt
      ? scratch.target.set(lookAt[0], lookAt[1], lookAt[2])
      : scratch.target.copy(camera.position).add(this.gazeOffset).add(glancing ? this.glance : NO_OFFSET);
    target.y -= nod * NOD_DROP;
    const dir = target.sub(from).normalize();

    // Turn toward the target, no further than a person would without their shoulders.
    const look = scratch.look.setFromUnitVectors(FORWARD, dir);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(look.w)));
    if (angle > MAX_HEAD_TURN) look.slerp(IDENTITY, 1 - MAX_HEAD_TURN / angle);

    const desired = scratch.desired.copy(look).multiply(this.headRestWorld);
    const parentWorld = head.parent.getWorldQuaternion(scratch.parent);
    const local = parentWorld.invert().multiply(desired);
    // Ease toward the new aim (a glance, a look back) rather than snapping.
    if (!this.headLocal || this.reduced) this.headLocal = local.clone();
    else this.headLocal.slerp(local, 1 - Math.exp(-delta * HEAD_TURN_RATE));
    head.quaternion.copy(this.headLocal);
  }

  /** For a scene that outlives the character: its materials and its clip. */
  dispose() {
    this.mixer?.stopAllAction();
    this.mixer?.uncacheRoot(this.scene);
    for (const material of this.materials) material.dispose();
    this.materials.length = 0;
  }
}
