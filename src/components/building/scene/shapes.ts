/**
 * Rounded solids for the things the user handles: a clipboard's board, its
 * clip, the notice board's frame and header plank, the back-to-desk tag.
 *
 * A rounded rectangle as a THREE.Shape, extruded with a small bevel —
 * react-three-renderer's <shape> + <extrudeGeometry>, in today's three. Each
 * size is built once and cached (its <resources> idea); never mutate one.
 *
 * Geometry lies in the XY plane, extruded toward +Z, back face at z = 0: put
 * it against a wall as is, or rotate it to lie flat.
 */

import * as THREE from "three";

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
