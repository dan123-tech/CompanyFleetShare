import { NextResponse } from "next/server";
import {
  getCorsAllowedOrigins,
  matchCorsOrigin,
  applyCorsHeaders,
  applyCorsPreflightHeaders,
} from "@/lib/security/cors";

/**
 * CORS for /api/* when CORS_ALLOWED_ORIGINS or NEXT_PUBLIC_APP_URL lists allowed browser origins.
 * Security headers in production (HTTPS-oriented). HSTS can be disabled via DISABLE_HSTS=1.
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

  const res = NextResponse.next();
  if (corsOrigin) {
    applyCorsHeaders(res, corsOrigin);
  }

  if (process.env.NODE_ENV !== "production") return res;

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https:",
    "script-src 'self' 'unsafe-inline' https:",
    "connect-src 'self' https: wss:",
    "upgrade-insecure-requests",
  ].join("; ");

  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");

  // HSTS only over HTTPS — never send on http:// (e.g. LAN IP) or browsers may behave oddly.
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
    // Skip static assets including .apk so installs are not affected by nosniff / extra headers.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|apk)$).*)",
  ],
};
