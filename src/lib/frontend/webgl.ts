/**
 * Can this browser draw WebGL? Asked once per page load.
 *
 * Callers use this as a useSyncExternalStore snapshot, which React calls on
 * every render. Each probe creates a WebGL context, and browsers cap live
 * contexts (about 16): an uncached probe soon makes the browser drop the
 * OLDEST context — the real scene's. So the answer is cached, and the probe
 * context is released straight away.
 */

let available: boolean | null = null;

export function webglAvailable(): boolean {
  if (available !== null) return available;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    available = Boolean(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    available = false;
  }
  return available;
}
