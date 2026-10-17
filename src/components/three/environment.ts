/**
 * Soft studio lighting for physically based materials: the reflections and
 * ambient light that give skin, fabric and hair their 3D shading.
 *
 * Generated in code from three's RoomEnvironment (a lit, neutral grey room),
 * so there is no HDR file to download. Built once per renderer and cached.
 *
 * Applied per material (material.envMap), not to the whole scene: the
 * building's toon scenery ignores it either way, and only the characters
 * opt in.
 */

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const cache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

export function studioEnvironment(gl: THREE.WebGLRenderer): THREE.Texture {
  let texture = cache.get(gl);
  if (!texture) {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    texture = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    cache.set(gl, texture);
  }
  return texture;
}
