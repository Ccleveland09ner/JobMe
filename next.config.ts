import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Explicit request body ceiling for the resume upload.
   *
   * This knob exists because the project has a `src/proxy.ts`, and its default
   * is 10MB with a failure mode of SILENT TRUNCATION - the body is buffered up
   * to the limit, a warning is logged, and the request still succeeds. A large
   * resume would arrive quietly corrupted rather than erroring.
   *
   * Pinning it here makes the number ours and documented. The app enforces a
   * lower 4MB cap of its own in /api/resume, and additionally compares
   * content-length against the bytes actually received, because this limit
   * cannot be trusted to announce itself.
   *
   * Still nested under `experimental` in 16.3.5 despite the App Router doc page
   * showing it top-level — verified against config-shared.d.ts.
   *
   * Ref: node_modules/next/dist/docs/01-app/03-api-reference/05-config/
   *      01-next-config-js/proxyClientMaxBodySize.md
   */
  experimental: {
    proxyClientMaxBodySize: "6mb",
  },
};

export default nextConfig;
