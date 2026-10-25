/**
 * The building's shapes, cached per size (never mutate one): boxes, and
 * rounded rectangles extruded with a small bevel (XY plane, extruded toward
 * +Z, back face at z = 0). UVs are in metres, so a detail texture keeps one
 * scale on every surface.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

type Size = readonly [number, number, number];

/** Which sizes each face's UVs run along: BoxGeometry builds ±X, ±Y, ±Z, in that order. */
const FACE_AXES = [
  [2, 1],
  [2, 1],
  [0, 2],
  [0, 2],
  [0, 1],
  [0, 1],
] as const;

const boxes = new Map<string, THREE.BufferGeometry>();

/**
 * A box of `size` (full extents, centred), its edges rounded by `round`.
 * uv1 keeps the 0–1 span across each face, for corner shade.
 */
export function box(size: Size, round = 0): THREE.BufferGeometry {
  const key = `${size.join("|")}|${round}`;
  let geometry = boxes.get(key);
  if (!geometry) {
    const [w, h, d] = size;
    geometry = round > 0 ? new RoundedBoxGeometry(w, h, d, 2, round) : new THREE.BoxGeometry(w, h, d);
    const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
    geometry.setAttribute("uv1", uv.clone());
    const perFace = uv.count / 6;
    for (let i = 0; i < uv.count; i++) {
      const [a, b] = FACE_AXES[Math.floor(i / perFace)];
      uv.setXY(i, uv.getX(i) * size[a], uv.getY(i) * size[b]);
    }
    boxes.set(key, geometry);
  }
  return geometry;
}

function roundedRectPath<T extends THREE.Path>(path: T, w: number, h: number, r: number): T {
  const x = -w / 2;
  const y = -h / 2;
  const radius = Math.min(r, w / 2, h / 2);
  path.moveTo(x + radius, y);
  path.lineTo(x + w - radius, y);
  path.quadraticCurveTo(x + w, y, x + w, y + radius);
  path.lineTo(x + w, y + h - radius);
  path.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  path.lineTo(x + radius, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - radius);
  path.lineTo(x, y + radius);
  path.quadraticCurveTo(x, y, x + radius, y);
  return path;
}

export interface SlabSpec {
  w: number;
  h: number;
  /** Corner radius. */
  r: number;
  depth: number;
  /** Bevel on the front and back edges; 0 for a crisp edge. */
  bevel?: number;
  /** A rounded hole (a frame), centred: inner width, height and radius. */
  hole?: { w: number; h: number; r: number };
}

const cache = new Map<string, THREE.ExtrudeGeometry>();

export function roundedSlab({ w, h, r, depth, bevel = 0, hole }: SlabSpec): THREE.ExtrudeGeometry {
  const key = JSON.stringify([w, h, r, depth, bevel, hole ?? null]);
  let geometry = cache.get(key);
  if (!geometry) {
    const shape = roundedRectPath(new THREE.Shape(), w, h, r);
    if (hole) shape.holes.push(roundedRectPath(new THREE.Path(), hole.w, hole.h, hole.r));
    geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      curveSegments: 6,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
    });
    // The bevel reaches past both faces; put the back face on z = 0.
    geometry.translate(0, 0, bevel);
    cache.set(key, geometry);
  }
  return geometry;
}

const crowns = new Map<number, THREE.BufferGeometry>();

/** A low-poly crown of leaves, unit radius: an icosahedron nudged out of round, one variant per seed. */
export function crown(seed: number): THREE.BufferGeometry {
  let geometry = crowns.get(seed);
  if (!geometry) {
    geometry = new THREE.IcosahedronGeometry(1, 1);
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      // A corner shared by several faces moves the same way in each.
      const bulge = 1 + 0.12 * Math.sin(x * 12.99 + y * 78.23 + z * 37.72 + seed * 4.1);
      position.setXYZ(i, x * bulge, y * bulge, z * bulge);
    }
    // Every face has its own corners, so this keeps the facets flat.
    geometry.computeVertexNormals();
    crowns.set(seed, geometry);
  }
  return geometry;
}
