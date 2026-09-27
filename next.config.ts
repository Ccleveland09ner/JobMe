import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Request body ceiling for the resume upload.
   *
   * Applies because the project has a `src/proxy.ts`. Its default is 10MB with
   * a failure mode of SILENT TRUNCATION: the body is buffered to the limit, a
   * warning is logged, and the request still succeeds. Pinning it makes the
   * number ours; /api/resume enforces a lower 4MB cap and compares
   * content-length against bytes received, because this limit does not
   * announce itself.
   *
   * Still nested under `experimental` in 16.3.5 despite the doc page showing
   * it top-level — verified against config-shared.d.ts.
   */
  experimental: {
    proxyClientMaxBodySize: "6mb",
  },
};

export default nextConfig;
