/**
 * Makes a clone of the shared character model into Ms. Crystal, the
 * receptionist: a Black woman with a natural afro. Her face is reshaped
 * (a broader nose, fuller lips, fuller cheekbones), her skin re-toned, she
 * wears a teal jacket over a printed blouse, a headband in the same print
 * and gold hoops, and she has a warm resting smile. Only the clone's own
 * geometry and materials change, so the interviewer is never touched; the
 * skeleton, idle clip and face shapes are shared, so the rig drives her
 * the same way.
 */

import * as THREE from "three";

import { buildAfro } from "./afro";
import { printTexture, redressOutfit, retoneSkin } from "./retexture";

/** A warm, medium-dark brown. */
export const SKIN_TONE = "#6f432c";
const JACKET = "#1d5c58";
const GOLD = "#d8a23e";

/** How much each feature changes, as a share of its own size (and metres for depth). */
const FACE = {
  noseWidth: 0.24,
  lipHeight: 0.2,
  lipWidth: 0.05,
  lipDepth: 0.0025,
  cheekWidth: 0.035,
  cheekDepth: 0.0025,
} as const;

/** A resting expression: a little smile in the eyes. */
const EXPRESSION: Record<string, number> = { cheekSquintLeft: 0.2, cheekSquintRight: 0.2, eyeSquintLeft: 0.08, eyeSquintRight: 0.08 };

const HOOP = { radius: 0.0155, tube: 0.0017, turn: 0.75 } as const;

type Disposable = { dispose: () => void };

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Every vertex's place in the model (metres), at the bind pose. */
function worldPositions(mesh: THREE.Mesh): THREE.Vector3[] {
  const count = mesh.geometry.getAttribute("position").count;
  return Array.from({ length: count }, (_, i) => mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
}

/**
 * The linear map from model metres back to the geometry's own space, solved
 * from four far-apart vertices (the geometry may be quantized and skinned).
 */
function toGeometrySpace(local: THREE.Vector3[], world: THREE.Vector3[]): THREE.Matrix3 | null {
  // The vertices furthest left, right, up and forward.
  const pick = [0, 0, 0, 0];
  world.forEach((w, i) => {
    if (w.x < world[pick[0]].x) pick[0] = i;
    if (w.x > world[pick[1]].x) pick[1] = i;
    if (w.y > world[pick[2]].y) pick[2] = i;
    if (w.z > world[pick[3]].z) pick[3] = i;
  });
  const columns = (pts: THREE.Vector3[]) => {
    const [a, b, c, d] = pick.map((i) => pts[i]);
    return new THREE.Matrix4().set(a.x, b.x, c.x, d.x, a.y, b.y, c.y, d.y, a.z, b.z, c.z, d.z, 1, 1, 1, 1);
  };
  const g = columns(local);
  if (Math.abs(g.determinant()) < 1e-12) return null;
  const toWorld = columns(world).multiply(g.invert());
  return new THREE.Matrix3().setFromMatrix4(toWorld).invert();
}

/** How strongly each vertex moves in the named face shapes, 0..1. */
function shapeWeights(mesh: THREE.Mesh, names: string[]): Float32Array {
  const dict = mesh.morphTargetDictionary ?? {};
  const targets = mesh.geometry.morphAttributes.position ?? [];
  const count = mesh.geometry.getAttribute("position").count;
  const out = new Float32Array(count);
  const v = new THREE.Vector3();
  for (const name of names) {
    const target = targets[dict[name]];
    if (!target) continue;
    for (let i = 0; i < count; i++) out[i] += v.fromBufferAttribute(target, i).length();
  }
  let max = 0;
  for (const w of out) max = Math.max(max, w);
  if (max > 0) for (let i = 0; i < count; i++) out[i] /= max;
  return out;
}

/** Broader nose, fuller lips, fuller cheekbones: on the head's own copy of its geometry. */
function reshapeFace(head: THREE.SkinnedMesh, eyeY: number): THREE.BufferGeometry {
  const geometry = head.geometry.clone();
  head.geometry = geometry;
  // Plain floats, so moved vertices aren't snapped to the quantization grid.
  const quantized = geometry.getAttribute("position");
  const position = new THREE.Float32BufferAttribute(quantized.count * 3, 3);
  for (let i = 0; i < quantized.count; i++) position.setXYZ(i, quantized.getX(i), quantized.getY(i), quantized.getZ(i));
  geometry.setAttribute("position", position);

  const local = Array.from({ length: position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(position, i));
  const world = worldPositions(head);
  const back = toGeometrySpace(local, world);
  if (!back) return geometry;

  // Each feature is found by the face shapes that move it.
  const lips = shapeWeights(head, ["mouthPucker"]);
  const nose = shapeWeights(head, ["noseSneerLeft", "noseSneerRight"]);
  const cheeks = shapeWeights(head, ["cheekSquintLeft", "cheekSquintRight"]);
  let mouthY = 0;
  let total = 0;
  lips.forEach((w, i) => {
    const k = w ** 4;
    mouthY += world[i].y * k;
    total += k;
  });
  mouthY = total ? mouthY / total : eyeY - 0.07;

  const delta = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const p = world[i];
    const wl = lips[i] ** 1.6;
    // The nose's wings and tip, not its bridge between the eyes.
    const wn = nose[i] ** 1.2 * smoothstep(eyeY - 0.004, eyeY - 0.03, p.y);
    const wc = cheeks[i] ** 2 * (1 - wl);
    if (wl + wn + wc < 1e-3) continue;
    delta.set(
      p.x * (FACE.lipWidth * wl + FACE.noseWidth * wn + FACE.cheekWidth * wc),
      (p.y - mouthY) * FACE.lipHeight * wl,
      FACE.lipDepth * wl + FACE.cheekDepth * wc,
    );
    delta.applyMatrix3(back);
    position.setXYZ(i, local[i].x + delta.x, local[i].y + delta.y, local[i].z + delta.z);
  }
  position.needsUpdate = true;
  geometry.computeBoundingSphere();
  return geometry;
}

/** Points over the head's surface: its vertices and the middle of each triangle and edge. */
function surfaceSamples(head: THREE.Mesh): THREE.Vector3[] {
  const world = worldPositions(head);
  const index = head.geometry.getIndex();
  const out = [...world];
  if (!index) return out;
  for (let t = 0; t < index.count; t += 3) {
    const [a, b, c] = [world[index.getX(t)], world[index.getX(t + 1)], world[index.getX(t + 2)]];
    out.push(
      new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
      new THREE.Vector3().addVectors(b, c).multiplyScalar(0.5),
      new THREE.Vector3().addVectors(a, c).multiplyScalar(0.5),
      new THREE.Vector3().add(a).add(b).add(c).divideScalar(3),
    );
  }
  return out;
}

/** The bottom of each earlobe: the lowest point of the ear, on each side. */
function earlobes(samples: THREE.Vector3[], eyeY: number): THREE.Vector3[] {
  return [1, -1].map((side) => {
    let lobe: THREE.Vector3 | null = null;
    for (const p of samples) {
      if (side * p.x < 0.074 || p.y > eyeY || p.y < eyeY - 0.07 || p.z < -0.03 || p.z > 0.07) continue;
      if (!lobe || p.y < lobe.y) lobe = p;
    }
    return lobe?.clone() ?? new THREE.Vector3(side * 0.083, eyeY - 0.035, 0.02);
  });
}

/** Rebuilds `scene` (a fresh clone, at its bind pose) as the receptionist; returns the cleanup. */
export function dressReceptionist(scene: THREE.Object3D): () => void {
  const disposables: Disposable[] = [];
  scene.updateMatrixWorld(true);

  const meshes: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  const named = (material: string) => meshes.filter((m) => (m.material as THREE.Material).name === material);
  const head = named("Wolf3D_Skin")[0] as THREE.SkinnedMesh | undefined;
  const headBone = scene.getObjectByName("Head");
  const eyeY = scene.getObjectByName("LeftEye")?.getWorldPosition(new THREE.Vector3()).y ?? 1.63;

  // The recruiter's bob comes off: the afro replaces it.
  for (const m of named("Wolf3D_Hair")) m.visible = false;

  if (head) disposables.push(reshapeFace(head, eyeY));

  /** A material swapped for a copy, shared as the original was. */
  const restyled = new Map<THREE.Material, THREE.Material>();
  const restyle = (material: string, change: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial) => {
    for (const mesh of named(material)) {
      const old = mesh.material as THREE.MeshStandardMaterial;
      let next = restyled.get(old);
      if (!next) {
        next = change(old.clone());
        restyled.set(old, next);
        disposables.push(next);
      }
      mesh.material = next;
    }
  };
  const ownMap = (m: THREE.MeshStandardMaterial, map: THREE.Texture | null) => {
    if (!map) return false;
    m.map = map;
    disposables.push(map);
    return true;
  };

  // Skin: the face's painted texture re-toned; the hands and neck matched to it.
  restyle("Wolf3D_Skin", (m) => {
    if (!(m.map && ownMap(m, retoneSkin(m.map, SKIN_TONE)))) m.color.set(SKIN_TONE);
    m.roughness = 0.58;
    return m;
  });
  restyle("Wolf3D_Body", (m) => {
    if (!(m.map && ownMap(m, retoneSkin(m.map, SKIN_TONE)))) m.color.set(SKIN_TONE);
    m.roughness = 0.6;
    return m;
  });
  // The outfit: the suit's cut, in her own cloth.
  restyle("avaturn_look_0_material", (m) => {
    if (!(m.map && ownMap(m, redressOutfit(m.map, JACKET)))) m.color.set(JACKET);
    return m;
  });
  // Eyes as they were, with a light wet gloss over them (more would mirror the office lights and pale the irises).
  for (const mesh of named("Wolf3D_Eye")) {
    const old = mesh.material as THREE.MeshStandardMaterial;
    let next = restyled.get(old);
    if (!next) {
      const glossy = new THREE.MeshPhysicalMaterial();
      THREE.MeshStandardMaterial.prototype.copy.call(glossy, old);
      glossy.clearcoat = 0.35;
      glossy.clearcoatRoughness = 0.12;
      next = glossy;
      restyled.set(old, next);
      disposables.push(next);
    }
    mesh.material = next;
  }

  // A warm resting expression; the rig never drives these shapes.
  if (head?.morphTargetDictionary && head.morphTargetInfluences) {
    for (const [shape, weight] of Object.entries(EXPRESSION)) {
      const i = head.morphTargetDictionary[shape];
      if (i !== undefined) head.morphTargetInfluences[i] = weight;
    }
  }

  if (head && headBone) {
    const samples = surfaceSamples(head);

    // The afro and its headband, on the head bone so they turn with her.
    const print = printTexture();
    if (print) {
      const afro = buildAfro(samples, print);
      headBone.attach(afro.group);
      disposables.push(print, afro);
    }

    // Gold hoops, hanging from each earlobe, turned a little toward the front.
    const hoop = new THREE.TorusGeometry(HOOP.radius, HOOP.tube, 12, 48);
    const gold = new THREE.MeshStandardMaterial({ name: "ReceptionistGold", color: GOLD, metalness: 1, roughness: 0.26 });
    disposables.push(hoop, gold);
    earlobes(samples, eyeY).forEach((lobe, i) => {
      const side = i === 0 ? 1 : -1;
      const ring = new THREE.Mesh(hoop, gold);
      ring.name = "ReceptionistHoop";
      ring.position.set(lobe.x + side * 0.002, lobe.y - HOOP.radius + 0.003, lobe.z + 0.002);
      ring.rotation.y = side * (Math.PI / 2 - HOOP.turn);
      scene.add(ring);
      ring.updateMatrixWorld();
      headBone.attach(ring);
    });
  }

  return () => disposables.forEach((d) => d.dispose());
}
