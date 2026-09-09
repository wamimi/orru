import type { NextConfig } from "next";

/**
 * bb.js uses threads only when `SharedArrayBuffer && crossOriginIsolated`, and
 * silently falls back to one thread otherwise — same result, several times
 * slower, no error. Isolation requires both headers below.
 *
 * `credentialless` rather than `require-corp` because `require-corp` blocks
 * cross-origin frames that do not opt in, which is how wallet connectors are
 * embedded. Set ORRU_COEP=require-corp for stricter isolation, or ORRU_COEP=off
 * if a connector breaks — proving still works, single-threaded.
 */
const coep = process.env.ORRU_COEP ?? "credentialless";

const isolation =
  coep === "off"
    ? []
    : [
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Embedder-Policy", value: coep },
      ];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [...isolation, { key: "Cross-Origin-Resource-Policy", value: "same-site" }],
      },
      {
        // Fetched by the prover before it runs. Cached but always revalidated:
        // a stale artifact here is one the deployed verifier will reject, and
        // the failure carries nothing that points back to this.
        source: "/circuit/:path*",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
