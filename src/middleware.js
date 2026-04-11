import { NextResponse } from "next/server";
import {
  getCorsAllowedOrigins,
  matchCorsOrigin,
  applyCorsHeaders,
  applyCorsPreflightHeaders,
} from "@/lib/security/cors";
import { clientIpFromRequest } from "@/lib/security/client-ip";
import { checkApiIpRateLimit } from "@/lib/security/middleware-ip-rate-limit";

/**
 * CORS for /api/* when CORS_ALLOWED_ORIGINS or NEXT_PUBLIC_APP_URL lists allowed browser origins.
 * API rate limit per IP (in-memory; see middleware-ip-rate-limit.js).
 * Security headers: CSP, X-Frame-Options, HSTS (HTTPS only), X-Content-Type-Options, etc.
 * HSTS can be disabled via DISABLE_HSTS=1.
 */
export function middleware(request) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const allowedList = getCorsAllowedOrigins();
  const originHeader = request.headers.get("origin");
  const corsOrigin =
    isApi && originHeader && allowedList.length > 0
      ? matchCorsOrigin(originHeader, allowedList)
      : null;

  if (isApi && request.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    if (corsOrigin) {
      applyCorsHeaders(res, corsOrigin);
      applyCorsPreflightHeaders(res, request);
    }
    return res;
  }

  if (isApi && request.method !== "OPTIONS") {
    const ip = clientIpFromRequest(request);
    const rl = checkApiIpRateLimit(ip);
    if (!rl.ok) {
      const res = NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
      res.headers.set("Retry-After", String(rl.retryAfterSec));
      if (corsOrigin) {
        applyCorsHeaders(res, corsOrigin);
      }
      return res;
    }
  }

  const res = NextResponse.next();
  if (corsOrigin) {
    applyCorsHeaders(res, corsOrigin);
  }
  if (!isApi) {
    res.headers.delete("Access-Control-Allow-Origin");
    res.headers.delete("Access-Control-Allow-Credentials");
    res.headers.delete("Access-Control-Allow-Headers");
    res.headers.delete("Access-Control-Allow-Methods");
    res.headers.delete("Access-Control-Max-Age");
    res.headers.delete("Vary");
  }

  /** Same-origin iframe (e.g. /glovebox/rca) must be allowed to embed this PDF/image stream. */
  const isGloveboxDocumentRoute =
    /^\/api\/cars\/[^/]+\/glovebox-document$/.test(pathname) ||
    /^\/api\/cars\/[^/]+\/vignette-document$/.test(pathname);

  const cspBase = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    isGloveboxDocumentRoute ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
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

  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", isGloveboxDocumentRoute ? "SAMEORIGIN" : "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  const reportOnly = process.env.CSP_REPORT_ONLY === "1";
  const reportUri = (process.env.CSP_REPORT_URI || "/api/csp-report").trim();
  const withReporting = reportUri ? `${cspBase}; report-uri ${reportUri}` : cspBase;
  res.headers.set(reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", withReporting);
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");

  if (process.env.DISABLE_HSTS !== "1" && request.nextUrl.protocol === "https:") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  if (!isApi && (request.method === "GET" || request.method === "HEAD")) {
    res.headers.set("Cache-Control", "no-store, max-age=0");
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|apk)$).*)",
  ],
};
