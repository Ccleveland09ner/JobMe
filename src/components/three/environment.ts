/**
 * Studio lighting for physically based materials, generated from three's
 * RoomEnvironment (no HDR file). Cached per renderer; applied per material.
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
