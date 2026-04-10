/**
 * Auth rate limits for login / register / MFA verify.
 * Prefers Cloudflare KV binding `RATE_LIMIT_KV` (Workers); falls back to Postgres `AuthRateLimit`.
 */

import { tryCloudflareWorkerEnv } from "@/lib/blob-env";
import { prisma } from "@/lib/db";

function rateLimitEnabled() {
  const v = process.env.AUTH_RATE_LIMIT_ENABLED;
  if (v === "0" || v === "false") return false;
  return true;
}

function windowMs() {
  const sec = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_SEC || "900", 10);
  return Number.isFinite(sec) && sec > 0 ? sec * 1000 : 900_000;
}

function loginFailIpMax() {
  const n = parseInt(process.env.AUTH_RATE_LOGIN_FAIL_IP_MAX || "10", 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function loginFailEmailMax() {
  const n = parseInt(process.env.AUTH_RATE_LOGIN_FAIL_EMAIL_MAX || "25", 10);
  return Number.isFinite(n) && n > 0 ? n : 25;
}

function registerIpMax() {
  const n = parseInt(process.env.AUTH_RATE_REGISTER_IP_MAX || "20", 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

function registerEmailMax() {
  const n = parseInt(process.env.AUTH_RATE_REGISTER_EMAIL_MAX || "8", 10);
  return Number.isFinite(n) && n > 0 ? n : 8;
}

/** @returns {{ get: (k: string) => Promise<string | null>; put: (k: string, v: string, o?: object) => Promise<void> } | null} */
function getKv() {
  try {
    const env = tryCloudflareWorkerEnv();
    const ns = env?.RATE_LIMIT_KV;
    if (ns && typeof ns.get === "function" && typeof ns.put === "function") {
      return ns;
    }
  } catch {
    /* not on Workers */
  }
  return null;
}

function keyLoginFailIp(ip) {
  return `auth:lf:ip:${ip}`;
}

function keyLoginFailEmail(emailNorm) {
  return `auth:lf:em:${emailNorm.slice(0, 200)}`;
}

function keyRegisterIp(ip) {
  return `auth:rg:ip:${ip}`;
}

function keyRegisterEmail(emailNorm) {
  return `auth:rg:em:${emailNorm.slice(0, 200)}`;
}

/** @param {{ get: (k: string) => Promise<string | null> }} kv */
async function kvPeekCount(kv, key) {
  const raw = await kv.get(key);
  if (!raw) return 0;
  try {
    const j = JSON.parse(raw);
    if (typeof j.c !== "number" || typeof j.e !== "number") return 0;
    if (j.e <= Date.now()) return 0;
    return j.c;
  } catch {
    return 0;
  }
}

/** @param {{ get: (k: string) => Promise<string | null>; put: (k: string, v: string, o?: object) => Promise<void> }} kv */
async function kvIncrement(kv, key, windowLenMs, max) {
  const raw = await kv.get(key);
  const now = Date.now();
  let c = 0;
  let exp = now + windowLenMs;
  if (raw) {
    try {
      const j = JSON.parse(raw);
      if (typeof j.c === "number" && typeof j.e === "number" && j.e > now) {
        c = j.c;
        exp = j.e;
      }
    } catch {
      /* reset */
    }
  }
  if (c >= max) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((exp - now) / 1000)) };
  }
  c += 1;
  const ttlSec = Math.min(86_400, Math.max(60, Math.ceil((exp - now) / 1000)));
  await kv.put(key, JSON.stringify({ c, e: exp }), { expirationTtl: ttlSec });
  return { allowed: true, retryAfterSec: null };
}

async function prismaPeekCount(id) {
  const row = await prisma.authRateLimit.findUnique({ where: { id } });
  if (!row || row.expiresAt < new Date()) return 0;
  return row.count;
}

async function prismaIncrement(id, windowLenMs, max) {
  const exp = new Date(Date.now() + windowLenMs);
  return prisma.$transaction(async (tx) => {
    await tx.authRateLimit.deleteMany({
      where: { id, expiresAt: { lt: new Date() } },
    });
    const row = await tx.authRateLimit.findUnique({ where: { id } });
    if (!row) {
      await tx.authRateLimit.create({ data: { id, count: 1, expiresAt: exp } });
      return { allowed: true, retryAfterSec: null };
    }
    if (row.count >= max) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000)),
      };
    }
    await tx.authRateLimit.update({
      where: { id },
      data: { count: { increment: 1 } },
    });
    return { allowed: true, retryAfterSec: null };
  });
}

async function peekCount(key) {
  const kv = getKv();
  if (kv) return kvPeekCount(kv, key);
  try {
    return await prismaPeekCount(key);
  } catch (e) {
    console.error("[rate-limit-auth] peekCount:", e?.message || e);
    return 0;
  }
}

async function incrementCount(key, max) {
  const w = windowMs();
  const kv = getKv();
  if (kv) {
    try {
      return await kvIncrement(kv, key, w, max);
    } catch (e) {
      console.error("[rate-limit-auth] kv increment:", e?.message || e);
    }
  }
  try {
    return await prismaIncrement(key, w, max);
  } catch (e) {
    console.error("[rate-limit-auth] prisma increment:", e?.message || e);
    return { allowed: true, retryAfterSec: null };
  }
}

/**
 * @param {string} email
 * @returns {string}
 */
export function normalizeEmailForRateLimit(email) {
  return String(email || "").trim().toLowerCase().slice(0, 320);
}

/**
 * Before processing login / MFA verify: block if buckets are full.
 * @returns {{ ok: true } | { ok: false, retryAfterSec: number }}
 */
export async function assertLoginAuthNotRateLimited(ip, emailNorm) {
  if (!rateLimitEnabled()) return { ok: true };
  const ipK = keyLoginFailIp(ip);
  const emK = keyLoginFailEmail(emailNorm);
  const [cIp, cEm] = await Promise.all([peekCount(ipK), peekCount(emK)]);
  if (cIp >= loginFailIpMax()) {
    return { ok: false, retryAfterSec: Math.ceil(windowMs() / 1000) };
  }
  if (cEm >= loginFailEmailMax()) {
    return { ok: false, retryAfterSec: Math.ceil(windowMs() / 1000) };
  }
  return { ok: true };
}

/** Record a failed credential or MFA step (increments IP + email buckets). */
export async function recordLoginAuthFailure(ip, emailNorm) {
  if (!rateLimitEnabled()) return;
  const ipK = keyLoginFailIp(ip);
  const emK = keyLoginFailEmail(emailNorm);
  await Promise.all([
    incrementCount(ipK, loginFailIpMax()),
    incrementCount(emK, loginFailEmailMax()),
  ]);
}

/**
 * Register: per-IP attempts (after body validates).
 * @returns {{ ok: true } | { ok: false, retryAfterSec: number }}
 */
export async function assertRegisterIpNotRateLimited(ip) {
  if (!rateLimitEnabled()) return { ok: true };
  const k = keyRegisterIp(ip);
  const c = await peekCount(k);
  if (c >= registerIpMax()) {
    return { ok: false, retryAfterSec: Math.ceil(windowMs() / 1000) };
  }
  return { ok: true };
}

/** Call once per register POST after Zod passes (counts toward IP cap). */
export async function recordRegisterPostAttempt(ip) {
  if (!rateLimitEnabled()) return;
  await incrementCount(keyRegisterIp(ip), registerIpMax());
}

/**
 * Per-email register cap (duplicate or new account).
 * @returns {{ ok: true } | { ok: false, retryAfterSec: number }}
 */
export async function assertRegisterEmailNotRateLimited(emailNorm) {
  if (!rateLimitEnabled()) return { ok: true };
  const k = keyRegisterEmail(emailNorm);
  const c = await peekCount(k);
  if (c >= registerEmailMax()) {
    return { ok: false, retryAfterSec: Math.ceil(windowMs() / 1000) };
  }
  return { ok: true };
}

export async function recordRegisterEmailAttempt(emailNorm) {
  if (!rateLimitEnabled()) return;
  await incrementCount(keyRegisterEmail(emailNorm), registerEmailMax());
}
