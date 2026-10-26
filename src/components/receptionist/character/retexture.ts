/**
 * New textures for the receptionist, painted from the shared model's own:
 * her skin tone (the painted detail kept, only the tone moved), her outfit
 * (a teal jacket over a printed blouse) and the print itself, which her
 * headband shares. Runs once, in the browser, on canvases.
 */

import * as THREE from "three";

/** sRGB byte to linear, and linear (0..1, 4096 steps) back to an sRGB byte. */
const TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255));
const TO_SRGB = Uint8ClampedArray.from({ length: 4097 }, (_, i) => Math.round(linearToSrgb(i / 4096) * 255));

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
const srgbByte = (linear: number) => TO_SRGB[Math.min(4096, Math.max(0, Math.round(linear * 4096)))];

/** A colour as linear RGB, from CSS. */
function linear(css: string): [number, number, number] {
  const c = new THREE.Color(css); // three keeps colours linear
  return [c.r, c.g, c.b];
}

/** The texture's pixels on a canvas, or null if they can't be read. */
function pixelsOf(texture: THREE.Texture): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; image: ImageData } | null {
  const source = texture.image as CanvasImageSource & { width: number; height: number };
  if (!source?.width || !source?.height || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(source, 0, 0);
    return { canvas, ctx, image: ctx.getImageData(0, 0, canvas.width, canvas.height) };
  } catch {
    return null;
  }
}

/** The same texture settings (UV channel, flip, wrap, colour space) over a new canvas. */
function replaced(texture: THREE.Texture, canvas: HTMLCanvasElement): THREE.Texture {
  const next = texture.clone();
  // Its own Source: a clone shares its original's, and setting `image` on it would repaint the interviewer.
  next.source = new THREE.TextureSource(canvas);
  next.needsUpdate = true;
  return next;
}

const luminance = (d: Uint8ClampedArray, i: number) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;

/** The per-channel median (linear) of the pixels `keep` accepts. */
function medianColor(d: Uint8ClampedArray, keep: (i: number) => boolean): [number, number, number] | null {
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8 || !keep(i)) continue;
    hist[0][d[i]]++;
    hist[1][d[i + 1]]++;
    hist[2][d[i + 2]]++;
    n++;
  }
  if (!n) return null;
  return hist.map((h) => {
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += h[v];
      if (seen >= n / 2) return TO_LINEAR[v];
    }
    return TO_LINEAR[255];
  }) as [number, number, number];
}

/** The luminance below which `fraction` of the pixels fall. */
function luminanceAt(d: Uint8ClampedArray, fraction: number): number {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    hist[Math.round(luminance(d, i) * 255)]++;
    n++;
  }
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v];
    if (seen >= n * fraction) return v / 255;
  }
  return 1;
}

/**
 * Skin in a new tone: each pixel keeps its ratio to the skin's typical colour
 * (so pores, lips, brows and shading stay), applied to `tone`.
 */
export function retoneSkin(texture: THREE.Texture, tone: string): THREE.Texture | null {
  const px = pixelsOf(texture);
  if (!px) return null;
  const d = px.image.data;
  // The skin, not the painted hair or the darkest details.
  const floor = luminanceAt(d, 0.35);
  const mean = medianColor(d, (i) => luminance(d, i) >= floor);
  if (!mean) return null;
  const target = linear(tone);
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) d[i + c] = srgbByte(target[c] * (TO_LINEAR[d[i + c]] / Math.max(1e-4, mean[c])));
  }
  px.ctx.putImageData(px.image, 0, 0);
  return replaced(texture, px.canvas);
}

// The print: terracotta ground, mustard rounds ringed in cream round a teal eye, cream diamonds between.
const PRINT = {
  ground: linear("#b4502c"),
  round: linear("#e2a42d"),
  ring: linear("#f3e5c6"),
  eye: linear("#145f5a"),
  diamond: linear("#f3e5c6"),
};

/** The print's colour (linear) at (x, y), in motif cells; rows alternate by half a cell. */
function printAt(x: number, y: number, out: number[]): number[] {
  const row = Math.floor(y);
  const fx = x + (row & 1 ? 0.5 : 0) - Math.floor(x + (row & 1 ? 0.5 : 0)) - 0.5;
  const fy = y - row - 0.5;
  const r = Math.hypot(fx, fy);
  const corner = Math.abs(Math.abs(fx) - 0.5) + Math.abs(Math.abs(fy) - 0.5);
  const c =
    r < 0.1 ? PRINT.eye : r < 0.2 ? PRINT.ring : r < 0.235 ? PRINT.round : r < 0.27 ? PRINT.ring : r < 0.36 ? PRINT.round : corner < 0.13 ? PRINT.diamond : PRINT.ground;
  out[0] = c[0];
  out[1] = c[1];
  out[2] = c[2];
  return out;
}

/** The print averaged over a texel (4 samples), so its edges stay soft at any size. */
function printTexel(x: number, y: number, cell: number, out: number[]): number[] {
  const s = [0, 0, 0];
  out[0] = out[1] = out[2] = 0;
  for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
    printAt((x + ox) / cell, (y + oy) / cell, s);
    out[0] += s[0] / 4;
    out[1] += s[1] / 4;
    out[2] += s[2] / 4;
  }
  return out;
}

/**
 * The outfit as a teal jacket over a printed blouse: the dark cloth (the
 * suit) takes `jacket`, the light (the shirt) takes the print, both keeping
 * the original's folds and seams.
 */
export function redressOutfit(texture: THREE.Texture, jacket: string): THREE.Texture | null {
  const px = pixelsOf(texture);
  if (!px) return null;
  const { width } = px.canvas;
  const d = px.image.data;
  const suit = medianColor(d, (i) => luminance(d, i) < 0.3);
  const shirt = medianColor(d, (i) => luminance(d, i) > 0.62);
  if (!suit || !shirt) return null;
  const cloth = linear(jacket);
  // About 22 motifs across a 1024 texture.
  const cell = width / 46;
  const print = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    const blouse = THREE.MathUtils.smoothstep(luminance(d, i), 0.38, 0.55);
    const p = i / 4;
    printTexel(p % width, Math.floor(p / width), cell, print);
    for (let c = 0; c < 3; c++) {
      const v = TO_LINEAR[d[i + c]];
      const out = (1 - blouse) * cloth[c] * (v / Math.max(1e-4, suit[c])) + blouse * print[c] * Math.min(1.15, v / Math.max(1e-4, shirt[c]));
      d[i + c] = srgbByte(out);
    }
  }
  px.ctx.putImageData(px.image, 0, 0);
  return replaced(texture, px.canvas);
}

/** The print as a tiling texture: two motifs a side (the headband fits one tile across). */
export function printTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  const out = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      printTexel(x, y, size / 2, out);
      const i = (y * size + x) * 4;
      image.data[i] = srgbByte(out[0]);
      image.data[i + 1] = srgbByte(out[1]);
      image.data[i + 2] = srgbByte(out[2]);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}
