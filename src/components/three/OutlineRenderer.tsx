"use client";

/**
 * Renders the scene through OutlineEffect (the ink edge on every mesh). One
 * per <Canvas>; priority 1 takes over rendering, after all other callbacks.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
// Patched copy: outlines offset on screen only, never in depth (see its header).
import { OutlineEffect } from "./OutlineEffect.js";

import { INK } from "./palette";
import { OUTLINE_THICKNESS } from "./toon";

export function OutlineRenderer() {
  const gl = useThree((s) => s.gl);
  const effect = useMemo(
    () => new OutlineEffect(gl, { defaultThickness: OUTLINE_THICKNESS, defaultColor: [INK.r, INK.g, INK.b] }),
    [gl],
  );

  useFrame(({ scene, camera }) => {
    effect.render(scene, camera);
  }, 1);

  return null;
}
