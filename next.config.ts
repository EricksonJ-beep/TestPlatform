import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WASM and must not be bundled; the Neon driver is plain fetch.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
