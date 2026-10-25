import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { box, crown } from "./shapes";

/** The largest u and v on each of a box's six faces (±X, ±Y, ±Z). */
function faceSpans(geometry: THREE.BufferGeometry, attribute = "uv"): number[][] {
  const uv = geometry.getAttribute(attribute);
  const perFace = uv.count / 6;
  return Array.from({ length: 6 }, (_, face) => {
    let u = 0;
    let v = 0;
    for (let i = face * perFace; i < (face + 1) * perFace; i++) {
      u = Math.max(u, uv.getX(i));
      v = Math.max(v, uv.getY(i));
    }
    return [Number(u.toFixed(6)), Number(v.toFixed(6))];
  });
}

// ±X faces run along depth and height, ±Y along width and depth, ±Z along width and height.
const METRES = [
  [0.5, 1],
  [0.5, 1],
  [2, 0.5],
  [2, 0.5],
  [2, 1],
  [2, 1],
];

describe("box", () => {
  it("spans each face's UVs in metres, so a texture keeps one scale on every box", () => {
    expect(faceSpans(box([2, 1, 0.5]))).toEqual(METRES);
  });

  it("does the same when rounded, and keeps its size", () => {
    const rounded = box([2, 1, 0.5], 0.05);
    expect(faceSpans(rounded)).toEqual(METRES);
    rounded.computeBoundingBox();
    const size = rounded.boundingBox!.getSize(new THREE.Vector3());
    expect(size.toArray().map((n) => Number(n.toFixed(6)))).toEqual([2, 1, 0.5]);
  });

  it("keeps a 0–1 span across each face on uv1, for corner shade", () => {
    expect(faceSpans(box([2, 1, 0.5]), "uv1")).toEqual(Array.from({ length: 6 }, () => [1, 1]));
  });

  it("is built once per size and rounding", () => {
    expect(box([1, 2, 3])).toBe(box([1, 2, 3]));
    expect(box([1, 2, 3], 0.1)).not.toBe(box([1, 2, 3]));
  });
});

describe("crown", () => {
  it("stays faceted: the three corners of every face share its normal", () => {
    const normal = crown(1).getAttribute("normal");
    const at = (i: number) => new THREE.Vector3().fromBufferAttribute(normal, i);
    for (let i = 0; i < normal.count; i += 3) {
      expect(at(i).distanceTo(at(i + 1))).toBeLessThan(1e-6);
      expect(at(i).distanceTo(at(i + 2))).toBeLessThan(1e-6);
    }
  });

  it("is one shape per seed", () => {
    expect(crown(2)).toBe(crown(2));
    expect(crown(2)).not.toBe(crown(3));
  });
});
