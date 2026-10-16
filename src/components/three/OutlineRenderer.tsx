"use client";

/**
 * Draws the whole scene once through three's OutlineEffect: the ink edge on
 * every mesh, characters and scenery alike. Mount exactly one per <Canvas>.
 *
 * Priority 1 takes over rendering from R3F, and runs after every priority-0
 * frame callback (avatars, camera), so the frame is drawn fully updated.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js";

import { INK, OUTLINE_THICKNESS } from "./toon";

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
