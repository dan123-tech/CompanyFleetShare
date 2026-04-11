/**
 * Fixed-window request counter per IP for Next.js middleware (Edge-compatible).
 * In-memory only — effective per isolate; use a CDN/WAF for strict global limits on serverless.
 *
 * Env: API_RATE_LIMIT_ENABLED (default on in production), API_RATE_LIMIT_PER_MINUTE (default 120).
 */

const STORE_KEY = "__fleetshareMwIpRl";

function enabled() {
  const v = process.env.API_RATE_LIMIT_ENABLED;
  if (v === "0" || v === "false") return false;
  if (v === "1" || v === "true") return true;
  return process.env.NODE_ENV === "production";
}

function perMinute() {
  const n = parseInt(process.env.API_RATE_LIMIT_PER_MINUTE || "120", 10);
  return Number.isFinite(n) && n > 0 ? n : 120;
}

function getStore() {
  const g = globalThis;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = { map: new Map(), sweep: 0 };
  }
  return g[STORE_KEY];
}

/**
 * @param {string} ip
 * @param {number} [now] ms epoch
 * @returns {{ ok: true } | { ok: false, retryAfterSec: number }}
 */
export function checkApiIpRateLimit(ip, now = Date.now()) {
  if (!enabled()) return { ok: true };
  const max = perMinute();
  const windowMs = 60_000;
  const windowId = Math.floor(now / windowMs);
  const key = `${ip.slice(0, 80)}:${windowId}`;

  const store = getStore();
  const { map } = store;
  const c = (map.get(key) || 0) + 1;
  map.set(key, c);

  store.sweep += 1;
  if (store.sweep % 500 === 0) {
    const minKeep = windowId - 2;
    for (const k of map.keys()) {
      const parts = k.split(":");
      const w = parseInt(parts[parts.length - 1], 10);
      if (!Number.isFinite(w) || w < minKeep) map.delete(k);
    }
  }

  if (c > max) {
    const nextWindowStart = (windowId + 1) * windowMs;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((nextWindowStart - now) / 1000)) };
  }
  return { ok: true };
}
