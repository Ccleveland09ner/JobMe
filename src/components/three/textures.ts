/**
 * Detail textures for the building's finishes (finishes.ts), drawn in code:
 * grey maps that multiply a palette colour (and bump it), so the colours stay
 * the palette's. Seeded, so every visit draws the same. Each is built on first
 * use and shared (never mutate one), and each has a real size: box UVs are in
 * metres (shapes.ts), so a texture keeps one scale on every surface.
 */

import * as THREE from "three";

export type DetailTexture =
  | "plaster"
  | "planks"
  | "grain"
  | "stone"
  | "pavers"
  | "grass"
  | "cork"
  | "paper"
  | "pages"
  | "leather"
  | "weave"
  | "hardboard";

/** A small seeded generator (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Value noise in [0, 1] that tiles: cx × cy lattice cells across an n × n image. */
function valueNoise(n: number, cx: number, cy: number, random: () => number): Float32Array {
  const lattice = Float32Array.from({ length: cx * cy }, random);
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const fy = (y / n) * cy;
    const y0 = Math.floor(fy);
    const ty = smooth(fy - y0);
    const r0 = (y0 % cy) * cx;
    const r1 = ((y0 + 1) % cy) * cx;
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * cx;
      const x0 = Math.floor(fx);
      const tx = smooth(fx - x0);
      const c0 = x0 % cx;
      const c1 = (x0 + 1) % cx;
      const a = lattice[r0 + c0] + (lattice[r0 + c1] - lattice[r0 + c0]) * tx;
      const b = lattice[r1 + c0] + (lattice[r1 + c1] - lattice[r1 + c0]) * tx;
      out[y * n + x] = a + (b - a) * ty;
    }
  }
  return out;
}

/** Layered value noise, from `cells` across up, in [0, 1]. */
function fbm(n: number, cells: number, octaves: number, random: () => number): Float32Array {
  const out = new Float32Array(n * n);
  let amplitude = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const layer = valueNoise(n, cells << o, cells << o, random);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amplitude;
    total += amplitude;
    amplitude *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

interface Recipe {
  /** Pixels across (a power of two). */
  size: number;
  /** Metres across, so it repeats every this many metres. */
  metres: number;
  /** Fills `out` (size × size, row by row from v = 0) with greys in [0, 1]. */
  draw: (out: Float32Array, n: number, random: () => number) => void;
}

/** Every pixel from `lo` to `hi` by a [0, 1] pattern. */
function span(out: Float32Array, pattern: Float32Array, lo: number, hi: number) {
  for (let i = 0; i < out.length; i++) out[i] = lo + (hi - lo) * pattern[i];
}

const RECIPES: Record<DetailTexture, Recipe> = {
  // Walls: soft, large mottling and a fine tooth.
  plaster: {
    size: 512,
    metres: 2,
    draw(out, n, random) {
      const cloud = fbm(n, 4, 4, random);
      for (let i = 0; i < out.length; i++) out[i] = 0.9 + 0.1 * (0.8 * cloud[i] + 0.2 * random());
    },
  },
  // Floorboards 0.2 m wide running along v, joints every 1.2 m, staggered.
  planks: {
    size: 1024,
    metres: 2.4,
    draw(out, n, random) {
      const boards = 12;
      const width = n / boards;
      const tone = Array.from({ length: boards }, () => 0.88 + 0.12 * random());
      const joint = Array.from({ length: boards }, () => random() * 0.5);
      const grain = valueNoise(n, 96, 6, random);
      const fibre = valueNoise(n, 384, 24, random);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const b = Math.floor(x / width);
          const across = x - b * width;
          // A seam between boards, or a joint along one; where they cross, the darker.
          const along = ((y / n - joint[b]) % 0.5 + 0.5) % 0.5;
          const seam = across < 1.5 || across > width - 1.5 ? 0.55 : 1;
          const end = along * n < 1.5 || (0.5 - along) * n < 1.5 ? 0.62 : 1;
          out[y * n + x] = tone[b] * (0.9 + 0.1 * grain[y * n + x]) * (0.96 + 0.04 * fibre[y * n + x]) * Math.min(seam, end);
        }
      }
    },
  },
  // Varnished wood: grain running along u, gently wavy.
  grain: {
    size: 512,
    metres: 1,
    draw(out, n, random) {
      const warp = fbm(n, 3, 2, random);
      const streak = valueNoise(n, 4, 64, random);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = y * n + x;
          // Thin dark lines on a lighter ground.
          const line = (0.5 + 0.5 * Math.cos(2 * Math.PI * (24 * (y / n) + 0.7 * warp[i]))) ** 6;
          out[i] = 0.86 + 0.14 * streak[i] - 0.12 * line;
        }
      }
    },
  },
  // Facade: ashlar blocks 0.6 × 0.3 m, staggered, with faint joints.
  stone: {
    size: 512,
    metres: 2.4,
    draw(out, n, random) {
      const rows = 8;
      const perRow = 4;
      const rowH = n / rows;
      const blockW = n / perRow;
      const tone = Array.from({ length: rows * perRow }, () => 0.9 + 0.1 * random());
      const mottle = fbm(n, 8, 3, random);
      for (let y = 0; y < n; y++) {
        const row = Math.floor(y / rowH);
        const shift = row % 2 ? blockW / 2 : 0;
        for (let x = 0; x < n; x++) {
          const sx = (x + shift) % n;
          const col = Math.floor(sx / blockW);
          let v = tone[row * perRow + col] * (0.92 + 0.08 * mottle[y * n + x]);
          if (y - row * rowH < 1.5 || sx - col * blockW < 1.5) v *= 0.8;
          out[y * n + x] = v;
        }
      }
    },
  },
  // The front path: 0.4 m pavers.
  pavers: {
    size: 512,
    metres: 1.2,
    draw(out, n, random) {
      const count = 3;
      const cell = n / count;
      const tone = Array.from({ length: count * count }, () => 0.88 + 0.12 * random());
      const mottle = fbm(n, 6, 3, random);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const cx = Math.floor(x / cell);
          const cy = Math.floor(y / cell);
          let v = tone[cy * count + cx] * (0.9 + 0.1 * mottle[y * n + x]);
          if (x - cx * cell < 2 || y - cy * cell < 2) v *= 0.7;
          out[y * n + x] = v;
        }
      }
    },
  },
  // Lawn: patches and blades.
  grass: {
    size: 512,
    metres: 3,
    draw(out, n, random) {
      const patches = fbm(n, 6, 3, random);
      const blades = valueNoise(n, 256, 128, random);
      for (let i = 0; i < out.length; i++) out[i] = 0.78 + 0.22 * (0.6 * patches[i] + 0.4 * blades[i]);
    },
  },
  // Cork: fine granules, some dark.
  cork: {
    size: 256,
    metres: 0.3,
    draw(out, n, random) {
      const base = fbm(n, 24, 3, random);
      for (let i = 0; i < out.length; i++) {
        const pit = random() < 0.1 ? 0.7 : 1;
        out[i] = (0.8 + 0.2 * base[i]) * pit;
      }
    },
  },
  // Paper: a faint fibre.
  paper: {
    size: 256,
    metres: 0.25,
    draw(out, n, random) {
      span(out, fbm(n, 32, 2, random), 0.94, 1);
    },
  },
  // A book's or pad's page edges: thin lines stacked along v.
  pages: {
    size: 256,
    metres: 0.02,
    draw(out, n, random) {
      const jitter = valueNoise(n, 8, 32, random);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = y * n + x;
          out[i] = 0.84 + 0.16 * (0.5 + 0.5 * Math.cos(2 * Math.PI * (40 * (y / n) + 0.3 * jitter[i])));
        }
      }
    },
  },
  // Leather: a pebbled grain.
  leather: {
    size: 256,
    metres: 0.15,
    draw(out, n, random) {
      const pebble = valueNoise(n, 48, 48, random);
      const soft = fbm(n, 6, 2, random);
      for (let i = 0; i < out.length; i++) out[i] = 0.84 + 0.16 * clamp01(0.7 * smooth(pebble[i]) + 0.3 * soft[i]);
    },
  },
  // Woven cloth: threads both ways.
  weave: {
    size: 256,
    metres: 0.05,
    draw(out, n, random) {
      const threads = 16;
      const slub = valueNoise(n, 16, 16, random);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const w = Math.sin((2 * Math.PI * threads * x) / n) * Math.sin((2 * Math.PI * threads * y) / n);
          out[y * n + x] = 0.84 + 0.16 * (0.75 * (0.5 + 0.5 * w) + 0.25 * slub[y * n + x]);
        }
      }
    },
  },
  // The clipboard's hardboard: a fine, even speckle.
  hardboard: {
    size: 256,
    metres: 0.2,
    draw(out, n, random) {
      span(out, fbm(n, 32, 2, random), 0.9, 1);
    },
  },
};

const SEEDS: Record<DetailTexture, number> = {
  plaster: 11,
  planks: 23,
  grain: 37,
  stone: 41,
  pavers: 53,
  grass: 67,
  cork: 71,
  paper: 83,
  pages: 97,
  leather: 101,
  weave: 113,
  hardboard: 127,
};

/** The greys of a detail texture, row by row; exported for the tests. */
export function detailPixels(name: DetailTexture): { size: number; values: Float32Array } {
  const { size, draw } = RECIPES[name];
  const values = new Float32Array(size * size);
  draw(values, size, seeded(SEEDS[name]));
  for (let i = 0; i < values.length; i++) values[i] = clamp01(values[i]);
  return { size, values };
}

function greyTexture(size: number, values: Float32Array): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < values.length; i++) {
    const g = Math.round(values[i] * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = g;
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  // Linear greys: they scale the colour, they aren't colours.
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const textures = new Map<DetailTexture, THREE.DataTexture>();

export function detailTexture(name: DetailTexture): THREE.DataTexture {
  let texture = textures.get(name);
  if (!texture) {
    const { size, values } = detailPixels(name);
    texture = greyTexture(size, values);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.setScalar(1 / RECIPES[name].metres);
    texture.anisotropy = 8;
    textures.set(name, texture);
  }
  return texture;
}

let shade: THREE.DataTexture | null = null;

/**
 * Darker toward every edge of a face (read on uv1, 0–1 per face): soft
 * shading where walls meet the floor, the ceiling and each other.
 */
export function cornerShadeTexture(): THREE.DataTexture {
  if (shade) return shade;
  const size = 256;
  const values = new Float32Array(size * size);
  const edge = (t: number) => 0.55 + 0.45 * smooth(clamp01(Math.min(t, 1 - t) / 0.07));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) values[y * size + x] = edge((x + 0.5) / size) * edge((y + 0.5) / size);
  }
  shade = greyTexture(size, values);
  shade.channel = 1;
  return shade;
}
