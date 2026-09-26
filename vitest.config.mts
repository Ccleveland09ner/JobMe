import { defineConfig } from "vitest/config";

/**
 * Unit tests only - the engine and the pure helpers. No browser, no network.
 *
 * `src/lib/engine/*` is the kernel and its tests are the regression harness
 * that protects the demo: the same scripted weak answer must always produce a
 * Clarify move. Keep these tests fast and dependency-free so there is never a
 * reason to skip them.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
