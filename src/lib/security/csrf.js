import { getCorsAllowedOrigins } from "@/lib/security/cors";

function normalizeOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Basic CSRF guard for cookie-authenticated endpoints.
 * Allows requests when:
 * - Origin matches current host origin, or
 * - Origin is in the explicit allow-list, or
 * - Origin is absent and Referer host matches current host (older clients)
 */
export function assertTrustedRequestOrigin(request) {
  const requestOrigin = normalizeOrigin(request.url);
  if (!requestOrigin) return { ok: false, reason: "Invalid request URL" };

  const allowed = new Set([requestOrigin, ...getCorsAllowedOrigins()]);
  const origin = normalizeOrigin(request.headers.get("origin"));
  if (origin) {
    if (allowed.has(origin)) return { ok: true };
    return { ok: false, reason: "Cross-site request blocked (Origin not allowed)" };
  }

  const referer = normalizeOrigin(request.headers.get("referer"));
  if (referer) {
    if (allowed.has(referer)) return { ok: true };
    return { ok: false, reason: "Cross-site request blocked (Referer not allowed)" };
  }

  // Non-browser or privacy-stripped client: allow (auth still required where applicable).
  return { ok: true };
}

