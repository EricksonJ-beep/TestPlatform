import type { NextConfig } from "next";

/**
 * Sent with every response (hardening plan H4.5, Nov 9 2026). Bloom may only be framed by
 * itself (its own hosted activities are), browsers don't guess file types, links out don't
 * carry the page address, and the camera, microphone and location are never asked for.
 * A full Content-Security-Policy (script sources) is not set yet: it needs testing against
 * YouTube embeds and R2 uploads first (docs/hardening-plan.md, H7).
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // PGlite ships WASM and must not be bundled; the Neon driver is plain fetch.
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
