/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Hide the floating Next.js dev tools badge (e.g. “N” in the corner) in development */
  devIndicators: false,
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
  serverExternalPackages: ["jose"],
  /*
   * Next.js 16 does not accept `experimental.turbo: false` (strict config schema).
   * To build with webpack instead of Turbopack, use the CLI: `next build --webpack`
   * (see `scripts/run-build.js` and `open-next.config.ts` buildCommand).
   */
};

export default nextConfig;

if (process.env.NODE_ENV === "development") {
  import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
}
