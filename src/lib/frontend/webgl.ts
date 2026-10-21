/**
 * Can this browser draw WebGL? Cached, with the probe context released at once:
 * browsers cap live contexts and drop the oldest (the real scene's).
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
