/**
 * CORS allow-list for /api/* (mobile apps, tools, or multiple front-end origins).
 * Set CORS_ALLOWED_ORIGINS=comma-separated origins, e.g. https://app.example.com,https://www.example.com
 * Falls back to NEXT_PUBLIC_APP_URL when CORS_ALLOWED_ORIGINS is unset (single origin).
 */

/**
 * @returns {string[]}
 */
export function getCorsAllowedOrigins() {
  const explicit = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (explicit) {
    return explicit
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean);
  }
  const single = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  return single ? [single] : [];
}

/**
 * @param {string | null} origin - Request Origin header
 * @param {string[]} allowed
 * @returns {string | null} Origin to echo back, or null if not allowed
 */
export function matchCorsOrigin(origin, allowed) {
  if (!origin || allowed.length === 0) return null;
  const normalized = origin.replace(/\/$/, "");
  if (allowed.includes(normalized)) return origin;
  return null;
}

/**
 * @param {import("next/server").NextResponse} res
 * @param {string} origin - Full Origin header value to echo (must be allow-listed)
 */
export function applyCorsHeaders(res, origin) {
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Vary", "Origin");
}

const DEFAULT_ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD";
const DEFAULT_ALLOW_HEADERS =
  "Content-Type, Authorization, X-Web-Session-Id, X-Client-Type, X-Requested-With";

/**
 * @param {import("next/server").NextResponse} res
 * @param {Request} request
 */
export function applyCorsPreflightHeaders(res, request) {
  const reqHdr = request.headers.get("access-control-request-headers");
  res.headers.set("Access-Control-Allow-Methods", DEFAULT_ALLOW_METHODS);
  res.headers.set("Access-Control-Allow-Headers", reqHdr || DEFAULT_ALLOW_HEADERS);
  res.headers.set("Access-Control-Max-Age", "86400");
}
