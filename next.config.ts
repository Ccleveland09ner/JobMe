import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Request body ceiling for requests the proxy runs on.
   *
   * Next buffers a body to hand it to the proxy, and past this limit (10MB by
   * default) it TRUNCATES SILENTLY: a warning is logged and the request still
   * succeeds. The proxy skips api/ (src/proxy.ts), so /api/resume is not
   * affected today; this pins the number in case that changes. /api/resume
   * enforces its own 4MB cap and checks content-length against bytes received.
   *
   * Still nested under `experimental` in 16.3.5 despite the doc page showing
   * it top-level — verified against config-shared.d.ts.
   */
  experimental: {
    proxyClientMaxBodySize: "6mb",
  },
};

export default nextConfig;
