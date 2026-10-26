/**
 * What the sky looks like this frame: the times of day blended by weight, the
 * lights also by how far outdoors the camera is. Sky.tsx writes it once a
 * frame, before anything reads it; the dome, clouds, lamps and lights read it.
 * One building canvas, so one look.
 */

import * as THREE from "three";

import { SKY, SKY_COLORS, SKY_NUMBERS, type SkyColor, type SkyNumber } from "./palette";
import { TIMES_OF_DAY } from "./timeOfDay";

/** The sky's colours and numbers, as SkySpec. */
export const skyLook = {
  color: Object.fromEntries(SKY_COLORS.map((k) => [k, new THREE.Color(SKY.day[k])])) as Record<SkyColor, THREE.Color>,
  value: Object.fromEntries(SKY_NUMBERS.map((k) => [k, SKY.day[k]])) as Record<SkyNumber, number>,
};

const parsed = TIMES_OF_DAY.map((t) => ({
  color: SKY_COLORS.map((k) => new THREE.Color(SKY[t][k])),
  value: SKY_NUMBERS.map((k) => SKY[t][k]),
}));

/** Set on lights only outdoors; indoors they stay as declared. */
const LIGHT_COLORS: ReadonlySet<SkyColor> = new Set(["hemi", "key", "fill"]);
const LIGHT_NUMBERS: ReadonlySet<SkyNumber> = new Set(["hemiFactor", "keyFactor", "fillFactor"]);

/** `weights` lines up with TIMES_OF_DAY and sums to 1; `outdoors` is 0 (inside) to 1. */
export function blendSky(weights: readonly number[], outdoors: number) {
  // Plain loops: this runs every frame.
  for (let ci = 0; ci < SKY_COLORS.length; ci++) {
    const k = SKY_COLORS[ci];
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < parsed.length; i++) {
      const c = parsed[i].color[ci];
      r += c.r * weights[i];
      g += c.g * weights[i];
      b += c.b * weights[i];
    }
    if (LIGHT_COLORS.has(k)) {
      // White is no tint.
      r = 1 + (r - 1) * outdoors;
      g = 1 + (g - 1) * outdoors;
      b = 1 + (b - 1) * outdoors;
    }
    // Already linear, as THREE.Color keeps it.
    skyLook.color[k].setRGB(r, g, b);
  }
  for (let ni = 0; ni < SKY_NUMBERS.length; ni++) {
    const k = SKY_NUMBERS[ni];
    let v = 0;
    for (let i = 0; i < parsed.length; i++) v += parsed[i].value[ni] * weights[i];
    skyLook.value[k] = LIGHT_NUMBERS.has(k) ? 1 + (v - 1) * outdoors : v;
  }
}

let motionQuery: MediaQueryList | null = null;

/** prefersReducedMotion(), without a new MediaQueryList every frame. Browser only. */
export function reducedMotion(): boolean {
  motionQuery ??= window.matchMedia("(prefers-reduced-motion: reduce)");
  return motionQuery.matches;
}
