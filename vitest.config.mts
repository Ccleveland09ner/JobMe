import { fileURLToPath } from "node:url";

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
  resolve: {
    alias: {
      // Mirrors the `@/*` path in tsconfig.json. Without it a test that
      // imports or mocks a module by its `@/` specifier fails to resolve,
      // while the same import works fine in the app.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
  },
});
