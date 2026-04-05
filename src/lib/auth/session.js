/**
 * Signed session cookie + server-side channel tokens (web vs mobile).
 * Payload: { userId, email, name, companyId, role, client, sid }
 *
 * HTTPS production: __Host- prefix, Secure, SameSite=strict.
 * HTTP (dev / LAN): legacy name, no Secure, SameSite=lax.
 */

import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  clearUserSessionToken,
  normalizeClientType,
  rotateUserSessionToken,
  userHasAnySessionToken,
  validateUserSessionToken,
} from "@/lib/auth/session-tokens";

const LEGACY_COOKIE_NAME = "car_sharing_session";
const HOST_COOKIE_NAME = "__Host-car_sharing_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function isProduction() {
  return process.env.NODE_ENV === "production";
}

/**
 * Whether the incoming request is served over HTTPS (or forwarded as such).
 * Vercel/serverless often use an internal http:// URL while the client used HTTPS; without a correct
 * forwarded proto, we'd set non-Secure cookies and browsers reject them on HTTPS pages (login looks OK but session is lost).
 * @param {Request} [request]
 */
export function isRequestHttps(request) {
  if (!request) return false;
  const raw = request.headers.get("x-forwarded-proto");
  if (raw) {
    const proto = raw.split(",")[0].trim().toLowerCase();
    if (proto === "https") return true;
    if (proto === "http") return false;
  }
  try {
    if (new URL(request.url).protocol === "https:") return true;
  } catch {
    /* ignore */
  }
  if (process.env.VERCEL === "1" && process.env.NODE_ENV === "production") return true;
  return false;
}

function resolveCookieBinding(request) {
  const dev = !isProduction();
  if (dev) {
    return { name: LEGACY_COOKIE_NAME, secure: false, sameSite: "lax" };
  }
  const https = isRequestHttps(request);
  if (https) {
    return { name: HOST_COOKIE_NAME, secure: true, sameSite: "strict" };
  }
  return { name: LEGACY_COOKIE_NAME, secure: false, sameSite: "lax" };
}

/** Primary cookie name for tooling (HTTPS prod → __Host-, else legacy). */
export function getSessionCookieName(request) {
  return resolveCookieBinding(request).name;
}

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set and at least 32 characters");
  }
  return secret;
}

function sign(payload) {
  const secret = getSecret();
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    hash = (hash << 5) - hash + c + secret.length;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/** Decode and verify cookie signature only (no DB). */
async function readRawSessionPayload() {
  const cookieStore = await cookies();
  const names = isProduction() ? [HOST_COOKIE_NAME, LEGACY_COOKIE_NAME] : [LEGACY_COOKIE_NAME];
  for (const name of names) {
    const raw = cookieStore.get(name)?.value;
    if (!raw) continue;
    try {
      const decoded = JSON.parse(Buffer.from(raw, "base64").toString());
      const expectedSig = sign(decoded.p);
      if (expectedSig !== decoded.s) continue;
      return JSON.parse(decoded.p);
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * @param {import("next/server").NextResponse} [nextResponse] If set, attach Set-Cookie on this response (avoids Next.js
 * throwing on Vercel when `cookies().set` + Secure is combined with an internal http:// request URL).
 */
async function writeCookieValue(payloadObj, request, nextResponse) {
  const payloadStr = JSON.stringify(payloadObj);
  const signature = sign(payloadStr);
  const value = Buffer.from(JSON.stringify({ p: payloadStr, s: signature })).toString("base64");
  const { name, secure, sameSite } = resolveCookieBinding(request);
  const opts = {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: MAX_AGE,
    path: "/",
  };
  if (nextResponse instanceof NextResponse) {
    nextResponse.cookies.set(name, value, opts);
    return;
  }
  const cookieStore = await cookies();
  cookieStore.set(name, value, opts);
}

/**
 * Full cookie write. Requires userId, email, name, companyId, role, client, sid.
 * @param {Object} p
 * @param {Request} [request]
 * @param {import("next/server").NextResponse} [nextResponse] Prefer this in Route Handlers on Vercel (see writeCookieValue).
 */
export async function writeSessionCookie(p, request, nextResponse) {
  const client = normalizeClientType(p.client);
  const payload = {
    userId: p.userId,
    email: p.email,
    name: p.name,
    companyId: p.companyId ?? null,
    role: p.role ?? null,
    client,
    sid: p.sid,
  };
  if (!payload.userId || !payload.email || !payload.sid) {
    throw new Error("writeSessionCookie: missing userId, email, or sid");
  }
  await writeCookieValue(payload, request, nextResponse);
}

/**
 * New login (or invite set-password): rotate channel token and set cookie.
 * @param {{ userId: string, email: string, name: string, companyId: string|null, role: string|null }} data
 * @param {"web"|"mobile"} clientType
 * @param {Request} [request]
 * @param {import("next/server").NextResponse} [nextResponse]
 */
export async function createUserSession(data, clientType, request, nextResponse) {
  const client = normalizeClientType(clientType);
  const sid = await rotateUserSessionToken(data.userId, client);
  await writeSessionCookie({ ...data, client, sid }, request, nextResponse);
  return sid;
}

/**
 * Update company/role on existing session without changing channel or invalidating other tabs of same channel incorrectly.
 * If cookie had no sid (legacy), establishes a token for that channel once.
 * @param {Object} current - from getSession()
 * @param {Object} updates - partial { companyId, role, email, name }
 * @param {Request} [request]
 * @param {import("next/server").NextResponse} [nextResponse]
 */
export async function extendUserSession(current, updates, request, nextResponse) {
  const client = normalizeClientType(current.client ?? "web");
  let sid = current.sid;
  if (!sid) {
    sid = await rotateUserSessionToken(current.userId, client);
  }
  await writeSessionCookie(
    {
      userId: current.userId,
      email: updates.email ?? current.email,
      name: updates.name ?? current.name,
      companyId: updates.companyId !== undefined ? updates.companyId : current.companyId,
      role: updates.role !== undefined ? updates.role : current.role,
      client,
      sid,
    },
    request,
    nextResponse
  );
  return sid;
}

/**
 * @deprecated Use createUserSession or extendUserSession — kept for accidental imports; prefer explicit helpers.
 */
export async function setSession(payload, request) {
  if (payload.sid && payload.client) {
    await writeSessionCookie(payload, request, undefined);
    return;
  }
  await createUserSession(
    {
      userId: payload.userId,
      email: payload.email,
      name: payload.name,
      companyId: payload.companyId ?? null,
      role: payload.role ?? null,
    },
    "web",
    request
  );
}

/**
 * Get validated session (DB token check). Includes client + sid for server use only.
 * Web: prefers `X-Web-Session-Id` (sessionStorage). If the header is missing, validates using the signed
 * cookie’s `sid` so new tabs / restored sessions work (sessionStorage is per-tab and can be empty while the
 * cookie is still valid). If the header is present, only that value is checked — a stale tab sending an old
 * sid still fails after someone else logs in on the same browser. Mobile uses cookie sid only.
 * @returns {Promise<Object|null>}
 */
export async function getSession() {
  const payload = await readRawSessionPayload();
  if (!payload || !payload.userId) return null;

  const client = normalizeClientType(payload.client);

  if (payload.sid && payload.client) {
    if (client === "mobile") {
      const ok = await validateUserSessionToken(payload.userId, "mobile", payload.sid);
      if (!ok) return null;
    } else {
      const headerSid = (await headers()).get("x-web-session-id")?.trim() || "";
      const cookieSid = typeof payload.sid === "string" ? payload.sid.trim() : "";
      const sidToValidate = headerSid || cookieSid;
      if (!sidToValidate) return null;
      const ok = await validateUserSessionToken(payload.userId, "web", sidToValidate);
      if (!ok) return null;
      return { ...payload, sid: sidToValidate };
    }
  } else if (await userHasAnySessionToken(payload.userId)) {
    return null;
  }

  return payload;
}

/** Public session fields (no sid / client). */
export function sessionPublicFields(session) {
  if (!session) return null;
  return {
    userId: session.userId,
    email: session.email,
    name: session.name,
    companyId: session.companyId ?? null,
    role: session.role ?? null,
  };
}

/**
 * Clear cookie and invalidate server token for this channel (if cookie carried sid).
 */
export async function clearSession() {
  const raw = await readRawSessionPayload();
  const cookieStore = await cookies();
  cookieStore.delete(HOST_COOKIE_NAME);
  cookieStore.delete(LEGACY_COOKIE_NAME);
  if (raw?.userId && raw.sid && raw.client) {
    await clearUserSessionToken(raw.userId, raw.client);
  }
}
