import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const isProduction = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "frame-src 'self' https:",
      "worker-src 'self'",
      "object-src 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https:",
      "script-src 'self' 'unsafe-inline' https:",
      "connect-src 'self' https: wss:",
      "upgrade-insecure-requests",
    ].join("; ");

    const cspGloveboxFrame = csp.replace("frame-ancestors 'none'", "frame-ancestors 'self'");

    const securityHeaders = [
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "X-Frame-Options",
        value: "DENY",
      },
      {
        key: "X-DNS-Prefetch-Control",
        value: "off",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(self), microphone=(), geolocation=()",
      },
      {
        key: "Cross-Origin-Opener-Policy",
        value: "same-origin",
      },
      {
        key: "Cross-Origin-Resource-Policy",
        value: "same-origin",
      },
      {
        key: "Content-Security-Policy",
        value: csp,
      },
    ];
    if (isProduction) {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=15552000",
      });
    }

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Allow /glovebox/rca to iframe this API (global CSP uses frame-ancestors 'none').
      {
        source: "/api/cars/:id/glovebox-document",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: cspGloveboxFrame },
        ],
      },
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/login",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/register",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/privacy",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/downloads/fleetshare.apk",
        headers: [
          {
            key: "Content-Type",
            value: "application/vnd.android.package-archive",
          },
          // No Content-Disposition: attachment — on many phones that blocks “Open” / package installer;
          // let the browser treat it as an Android package.
        ],
      },
    ];
  },
  /* Hide the floating Next.js dev tools badge (e.g. “N” in the corner) in development */
  devIndicators: false,
  /** Do not publish browser source maps in production (default is false; set explicitly). */
  productionBrowserSourceMaps: false,
  /**
   * Prisma `engineType = "client"` loads `query_compiler_bg.wasm` at runtime.
   * Next.js output file tracing often omits `.wasm` from `/var/task`, which breaks Vercel with ENOENT.
   */
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/.prisma/client/**/*",
      "./node_modules/@prisma/client/**/*",
    ],
  },
  /** OpenNext Cloudflare copies these for workerd; needed for packages like `jose`. */
  serverExternalPackages: ["jose", "@vercel/blob"],
  /*
   * Next.js 16 does not accept `experimental.turbo: false` (strict config schema).
   * To build with webpack instead of Turbopack, use the CLI: `next build --webpack`
   * (see `scripts/run-build.js` and `open-next.config.ts` buildCommand).
   */
  /**
   * Production client bundles only: rename identifiers to hexadecimal-style names (obfuscation).
   * Aggressive features (control-flow, string encryption) stay off so React / Next stay stable.
   * Set DISABLE_WEB_OBFUSCATION=1 to skip (e.g. while debugging a broken build).
   */
  webpack(config, { dev, isServer }) {
    if (dev || isServer || process.env.DISABLE_WEB_OBFUSCATION === "1") {
      return config;
    }
    try {
      const WebpackObfuscator = require("webpack-obfuscator");
      config.plugins.push(
        new WebpackObfuscator(
          {
            compact: true,
            simplify: true,
            identifierNamesGenerator: "hexadecimal",
            renameGlobals: false,
            controlFlowFlattening: false,
            deadCodeInjection: false,
            debugProtection: false,
            selfDefending: false,
            stringArray: false,
            transformObjectKeys: false,
            unicodeEscapeSequence: false,
            numbersToExpressions: false,
            splitStrings: false,
            log: false,
          },
          [
            "**/framework-*.js",
            "**/main-app-*.js",
            "**/polyfills-*.js",
            "**/webpack-*.js",
            "**/react-refresh*.js",
          ]
        )
      );
    } catch (e) {
      console.warn("[next.config] webpack-obfuscator not applied:", e?.message || e);
    }
    return config;
  },
};

export default nextConfig;

if (process.env.NODE_ENV === "development") {
  import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
}
