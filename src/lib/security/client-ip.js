/**
 * Best-effort client IP for rate limiting (Cloudflare, reverse proxies, local dev).
 */

/**
 * @param {Request} request
 * @returns {string}
 */
export function clientIpFromRequest(request) {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf.slice(0, 80);
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 80);
  const xfwd = request.headers.get("x-forwarded-for") || "";
  const first = xfwd.split(",")[0]?.trim();
  if (first) return first.slice(0, 80);
  return "unknown";
}
