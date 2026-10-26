/**
 * The receptionist's afro, grown from her own head: a shell that rises out of
 * the scalp along a hairline and swells to a rounded crown, lumped with
 * noise, covered in coil clumps (so its outline is curly from any side), and
 * a printed headband pressed into it over the crown. Built in model space
 * at the bind pose; dress.ts hangs it on the head bone.
 */

import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { fractal, gradientNoise, seededRandom } from "./noise";

/** Metres. The crown's size over the skull, and where it sits. */
const CROWN = { radii: new THREE.Vector3(0.158, 0.138, 0.156), drop: 0.035, back: 0.022 } as const;
/** Lumps (clumps of curls) and the finer texture over them, in metres. */
const LUMP = { frequency: 6.5, depth: 0.011 } as const;
const FINE = { frequency: 19, depth: 0.0035 } as const;
/** How far above the hairline the hair reaches its full height. */
const RISE = 0.028;

/** The hairline: how far below the top of the head it runs, by angle round the head from the front. */
const HAIRLINE: readonly [number, number][] = [
  [0, 0.031],
  [0.5, 0.04],
  [0.95, 0.066],
  [1.3, 0.108],
  [1.6, 0.086],
  [1.95, 0.13],
  [2.5, 0.17],
  [Math.PI, 0.19],
];

/** The hairline wanders a little, as a real one does. */
const HAIRLINE_JITTER = { frequency: 9, depth: 0.004 } as const;

/** Coils over the shell, by layer: how many directions are tried, their size range, and how grown the hair must be. */
const COILS = [
  { tries: 2200, size: [0.0075, 0.0125], minGrow: 0.6 },
  { tries: 3200, size: [0.0042, 0.0072], minGrow: 0.45 },
  // The soft edge along the hairline: small, sparse.
  { tries: 6500, size: [0.003, 0.0056], minGrow: 0.06, maxGrow: 0.75 },
] as const;

/** The headband: its tilt forward from upright, width and thickness (metres). */
const BAND = { tilt: 0.38, width: 0.034, thickness: 0.012, press: 0.004 } as const;

const SEED = 20261026;
const HAIR_COLOR = new THREE.Color("#1b120d");
const SHEEN_COLOR = new THREE.Color("#6e4b35");

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function hairlineDrop(angle: number): number {
  const a = Math.min(Math.PI, Math.abs(angle));
  for (let i = 1; i < HAIRLINE.length; i++) {
    const [a1, d1] = HAIRLINE[i];
    if (a <= a1) {
      const [a0, d0] = HAIRLINE[i - 1];
      return d0 + (d1 - d0) * smoothstep(a0, a1, a);
    }
  }
  return HAIRLINE[HAIRLINE.length - 1][1];
}

/**
 * How far the skin is from `center` in each direction: the furthest sample
 * in each cell of a latitude-longitude grid, gaps filled from neighbours.
 */
class SkullRadius {
  private readonly cells: Float32Array;

  constructor(
    private readonly center: THREE.Vector3,
    samples: readonly THREE.Vector3[],
    private readonly rows = 28,
    private readonly cols = 56,
  ) {
    const cells = new Float32Array(rows * cols);
    const d = new THREE.Vector3();
    for (const p of samples) {
      d.subVectors(p, center);
      const r = d.length();
      if (r < 1e-6) continue;
      d.divideScalar(r);
      const i = this.index(d);
      if (r > cells[i]) cells[i] = r;
    }
    // Fill the empty cells from their filled neighbours, a ring at a time.
    for (let pass = 0; pass < 40; pass++) {
      let empty = 0;
      const next = cells.slice();
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (cells[row * cols + col] > 0) continue;
          let sum = 0;
          let n = 0;
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const r2 = row + dr;
            if (r2 < 0 || r2 >= rows) continue;
            const v = cells[r2 * cols + ((col + dc + cols) % cols)];
            if (v > 0) {
              sum += v;
              n++;
            }
          }
          if (n) next[row * cols + col] = sum / n;
          else empty++;
        }
      }
      cells.set(next);
      if (!empty) break;
    }
    this.cells = cells;
  }

  private coords(d: THREE.Vector3): [number, number] {
    const theta = Math.acos(Math.min(1, Math.max(-1, d.y)));
    const phi = Math.atan2(d.x, d.z);
    return [(theta / Math.PI) * this.rows - 0.5, ((phi + Math.PI) / (2 * Math.PI)) * this.cols - 0.5];
  }

  private index(d: THREE.Vector3): number {
    const [r, c] = this.coords(d);
    const row = Math.min(this.rows - 1, Math.max(0, Math.round(r)));
    const col = ((Math.round(c) % this.cols) + this.cols) % this.cols;
    return row * this.cols + col;
  }

  /** Bilinear between cells. */
  at(d: THREE.Vector3): number {
    const [r, c] = this.coords(d);
    const r0 = Math.floor(r);
    const c0 = Math.floor(c);
    const fr = r - r0;
    const fc = c - c0;
    const get = (row: number, col: number) =>
      this.cells[Math.min(this.rows - 1, Math.max(0, row)) * this.cols + (((col % this.cols) + this.cols) % this.cols)];
    return (
      (get(r0, c0) * (1 - fc) + get(r0, c0 + 1) * fc) * (1 - fr) + (get(r0 + 1, c0) * (1 - fc) + get(r0 + 1, c0 + 1) * fc) * fr
    );
  }
}

/** Where along the band plane a direction is, and how far off it (radians). */
interface BandSpot {
  along: number;
  off: number;
}

export interface Afro {
  group: THREE.Group;
  dispose: () => void;
}

/**
 * Grows the afro over a head given as surface samples (model space, metres,
 * facing +Z). `print` is the headband's fabric.
 */
export function buildAfro(samples: readonly THREE.Vector3[], print: THREE.Texture): Afro {
  let top = -Infinity;
  for (const p of samples) top = Math.max(top, p.y);
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const p of samples) {
    if (p.y < top - 0.05) continue;
    zMin = Math.min(zMin, p.z);
    zMax = Math.max(zMax, p.z);
  }
  const zMid = (zMin + zMax) / 2;
  const center = new THREE.Vector3(0, top - 0.09, zMid);
  const crown = new THREE.Vector3(0, top - CROWN.drop, zMid - CROWN.back);
  const skull = new SkullRadius(center, samples);
  const noise = gradientNoise(SEED);

  // The band's plane: through the centre, across the head, tilted forward.
  const bandUp = new THREE.Vector3(0, Math.cos(BAND.tilt), Math.sin(BAND.tilt));
  const bandSide = new THREE.Vector3(1, 0, 0);
  const bandNormal = new THREE.Vector3().crossVectors(bandSide, bandUp).normalize();
  const bandHalf = BAND.width / 2 / 0.15; // radians, at a typical radius
  const bandSpot = (d: THREE.Vector3): BandSpot => ({
    along: Math.atan2(d.dot(bandUp), d.dot(bandSide)),
    off: Math.asin(Math.min(1, Math.max(-1, d.dot(bandNormal)))),
  });

  const q = new THREE.Vector3();
  const dd = new THREE.Vector3();
  /** Distance from the centre to the crown's ellipsoid along `d`. */
  const crownAt = (d: THREE.Vector3) => {
    q.subVectors(center, crown).divide(CROWN.radii);
    dd.copy(d).divide(CROWN.radii);
    const a = dd.dot(dd);
    const b = 2 * q.dot(dd);
    const c = q.dot(q) - 1;
    return (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
  };

  /** The hair along `d`: how far it reaches, smooth and textured, and how grown it is. */
  const hairAt = (d: THREE.Vector3, arc: { from: number; to: number } | null) => {
    const s = skull.at(d);
    const y = center.y + d.y * s;
    const around = Math.atan2(d.x, d.z);
    const line =
      top - hairlineDrop(around) + HAIRLINE_JITTER.depth * noise(Math.cos(around) * HAIRLINE_JITTER.frequency, Math.sin(around) * HAIRLINE_JITTER.frequency, 3.7);
    // Below the hairline the shell sinks out of sight inside the head.
    const inside = smoothstep(line - 0.03, line - 0.003, y);
    const base = THREE.MathUtils.lerp(0.55 * s, s - 0.0015, inside);
    const grow = Math.pow(smoothstep(line - 0.003, line + RISE, y), 0.55);
    const height = Math.max(crownAt(d), s + 0.004) - s + 0.0015;
    // Pressed flat under the band, which only runs where the hair is full.
    let under = 0;
    if (arc) {
      const spot = bandSpot(d);
      if (spot.along > arc.from - 0.05 && spot.along < arc.to + 0.05) under = smoothstep(1.9, 0.6, Math.abs(spot.off) / bandHalf);
    }
    const lump = fractal(noise, d.x * LUMP.frequency, d.y * LUMP.frequency, d.z * LUMP.frequency, 3);
    const fine = noise(d.x * FINE.frequency + 17, d.y * FINE.frequency, d.z * FINE.frequency);
    const smooth = base + grow * (height - BAND.press * under);
    // Full texture soon after the hair starts, so the rise from the skin is curly, not a smooth wall.
    const texture = Math.sqrt(grow) * (1 - 0.9 * under) * (LUMP.depth * lump + FINE.depth * fine);
    return { smooth, radius: smooth + texture, grow, lump, under };
  };

  // Where the band can run: over the crown, out to where the hair thins on each side.
  const dir = new THREE.Vector3();
  const bandDir = (along: number, off: number) =>
    dir
      .copy(bandSide)
      .multiplyScalar(Math.cos(along))
      .addScaledVector(bandUp, Math.sin(along))
      .multiplyScalar(Math.cos(off))
      .addScaledVector(bandNormal, Math.sin(off))
      .normalize();
  const arc = { from: Math.PI / 2, to: Math.PI / 2 };
  while (arc.from > -0.6 && hairAt(bandDir(arc.from - 0.02, 0), null).grow > 0.8) arc.from -= 0.02;
  while (arc.to < Math.PI + 0.6 && hairAt(bandDir(arc.to + 0.02, 0), null).grow > 0.8) arc.to += 0.02;

  const disposables: { dispose: () => void }[] = [];
  const group = new THREE.Group();
  group.name = "ReceptionistAfro";

  // 1. The shell, shaded darker underneath, in the hollows and toward the hairline.
  const shell = mergeVertices(new THREE.IcosahedronGeometry(1, 48).deleteAttribute("normal").deleteAttribute("uv"));
  const position = shell.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    dir.fromBufferAttribute(position, i).normalize();
    const hair = hairAt(dir, arc);
    position.setXYZ(i, center.x + dir.x * hair.radius, center.y + dir.y * hair.radius, center.z + dir.z * hair.radius);
    const shade = (0.8 + 0.35 * hair.lump) * (0.62 + 0.38 * smoothstep(-0.7, 0.25, dir.y)) * (0.74 + 0.26 * hair.grow);
    tint.copy(HAIR_COLOR).multiplyScalar(shade);
    tint.toArray(colors, i * 3);
  }
  shell.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  shell.computeVertexNormals();
  const hairMaterial = new THREE.MeshPhysicalMaterial({
    name: "ReceptionistHair",
    vertexColors: true,
    roughness: 0.9,
    sheen: 1,
    sheenRoughness: 0.5,
    sheenColor: SHEEN_COLOR,
  });
  const shellMesh = new THREE.Mesh(shell, hairMaterial);
  shellMesh.name = "ReceptionistAfroShell";
  group.add(shellMesh);
  disposables.push(shell, hairMaterial);

  // 2. Coil clumps over it: small knotted balls, half sunk, so the outline is curly.
  const random = seededRandom(SEED + 1);
  const clump = new THREE.IcosahedronGeometry(1, 1);
  const cp = clump.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < cp.count; i++) {
    dir.fromBufferAttribute(cp, i);
    const k = 1 + 0.28 * noise(dir.x * 2.1 + 5, dir.y * 2.1, dir.z * 2.1);
    cp.setXYZ(i, dir.x * k, dir.y * k, dir.z * k);
  }
  const clumpGeometry = mergeVertices(clump.deleteAttribute("normal").deleteAttribute("uv"));
  clumpGeometry.computeVertexNormals();
  clump.dispose();
  const spots: THREE.Matrix4[] = [];
  const clumpColors: THREE.Color[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const m = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const at = new THREE.Vector3();
  for (const layer of COILS) {
    const maxGrow = "maxGrow" in layer ? layer.maxGrow : Infinity;
    for (let i = 0; i < layer.tries; i++) {
      // An even spread of directions (a Fibonacci sphere), each nudged a little.
      const y = 1 - (2 * (i + 0.5)) / layer.tries;
      const ring = Math.sqrt(1 - y * y);
      const turn = golden * i + (random() - 0.5) * 0.6;
      dir.set(Math.cos(turn) * ring, y, Math.sin(turn) * ring).normalize();
      const hair = hairAt(dir, arc);
      if (hair.grow < layer.minGrow || hair.grow > maxGrow || hair.under > 0.04) continue;
      const size = THREE.MathUtils.lerp(layer.size[0], layer.size[1], random()) * (0.6 + 0.4 * hair.grow);
      at.copy(center).addScaledVector(dir, hair.radius - 0.35 * size);
      euler.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
      scale.set(size, size * THREE.MathUtils.lerp(0.7, 1, random()), size);
      spots.push(m.compose(at, quaternion.setFromEuler(euler), scale).clone());
      const light = random();
      clumpColors.push(
        new THREE.Color().copy(HAIR_COLOR).multiplyScalar(light > 0.92 ? 1.6 : THREE.MathUtils.lerp(0.72, 1.18, light)),
      );
    }
  }
  const clumpMaterial = new THREE.MeshPhysicalMaterial({
    name: "ReceptionistCurls",
    roughness: 0.88,
    sheen: 1,
    sheenRoughness: 0.45,
    sheenColor: SHEEN_COLOR,
  });
  const clumps = new THREE.InstancedMesh(clumpGeometry, clumpMaterial, spots.length);
  clumps.name = "ReceptionistAfroCurls";
  // The shell under them casts the hair's shadow.
  clumps.userData.noShadow = true;
  spots.forEach((spot, i) => {
    clumps.setMatrixAt(i, spot);
    clumps.setColorAt(i, clumpColors[i]);
  });
  clumps.instanceMatrix.needsUpdate = true;
  if (clumps.instanceColor) clumps.instanceColor.needsUpdate = true;
  group.add(clumps);
  disposables.push(clumpGeometry, clumpMaterial, clumps);

  // 3. The headband: a pillowy strip of printed fabric, its ends tucked into the hair.
  const lengthSteps = 140;
  const widthSteps = 10;
  const bandPositions: number[] = [];
  const bandUvs: number[] = [];
  const bandIndex: number[] = [];
  const span = arc.to - arc.from;
  const meanRadius = hairAt(bandDir(Math.PI / 2, 0), arc).smooth;
  for (let a = 0; a <= lengthSteps; a++) {
    const f = a / lengthSteps;
    const along = arc.from + span * f;
    // The last stretch at each end dips under the hair.
    const tuck = 0.012 * (1 - smoothstep(0, 0.12, Math.min(f, 1 - f)));
    for (let b = 0; b <= widthSteps; b++) {
      const t = (b / widthSteps) * 2 - 1;
      bandDir(along, t * bandHalf);
      const r = hairAt(dir, arc).smooth - 0.002 + BAND.thickness * Math.sqrt(Math.max(0, 1 - t * t)) - tuck;
      bandPositions.push(center.x + dir.x * r, center.y + dir.y * r, center.z + dir.z * r);
      bandUvs.push((span * meanRadius * f) / BAND.width, b / widthSteps);
    }
  }
  for (let a = 0; a < lengthSteps; a++) {
    for (let b = 0; b < widthSteps; b++) {
      const i = a * (widthSteps + 1) + b;
      const j = i + widthSteps + 1;
      bandIndex.push(i, j, i + 1, i + 1, j, j + 1);
    }
  }
  const band = new THREE.BufferGeometry();
  band.setAttribute("position", new THREE.Float32BufferAttribute(bandPositions, 3));
  band.setAttribute("uv", new THREE.Float32BufferAttribute(bandUvs, 2));
  band.setIndex(bandIndex);
  band.computeVertexNormals();
  const bandMaterial = new THREE.MeshPhysicalMaterial({
    name: "ReceptionistHeadband",
    map: print,
    roughness: 0.78,
    sheen: 0.6,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color("#f2e3c4"),
    side: THREE.DoubleSide,
  });
  const bandMesh = new THREE.Mesh(band, bandMaterial);
  bandMesh.name = "ReceptionistHeadband";
  group.add(bandMesh);
  disposables.push(band, bandMaterial);

  return {
    group,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
