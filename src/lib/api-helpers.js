/**
 * Shared helpers for API routes: JSON responses and session/role checks.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isCompanyAdmin } from "@/lib/companies";
import { getTenantConfig } from "@/lib/tenant-db";
import { assertTrustedRequestOrigin } from "@/lib/security/csrf";

export function jsonResponse(data, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * 429 with Retry-After for auth / register rate limits.
 * @param {string} [message]
 * @param {number} [retryAfterSec]
 */
export function rateLimitResponse(
  message = "Too many attempts. Please try again later.",
  retryAfterSec = 60
) {
  const res = NextResponse.json({ error: message }, { status: 429 });
  res.headers.set("Retry-After", String(Math.max(1, retryAfterSec)));
  return res;
}

/**
 * Cookie-backed mutating routes: reject cross-site requests without a trusted Origin/Referer.
 * @param {Request} request
 * @returns {NextResponse | null} Response to return, or null if OK.
 */
export function requireTrustedOriginForMutation(request) {
  const r = assertTrustedRequestOrigin(request);
  if (!r.ok) return errorResponse(r.reason, 403);
  return null;
}

/** 503 when layer uses external provider (not yet connected). Client can show "Data Source Not Configured". */
export function dataSourceNotConfiguredResponse(layer, message = "Data source not configured for this layer.") {
  return NextResponse.json({ error: message, code: "DATA_SOURCE_NOT_CONFIGURED", layer }, { status: 503 });
}

/**
 * Get current session or return 401 JSON response.
 * @returns {{ session: Object } | { response: NextResponse }}
 */
export async function requireSession() {
  const session = await getSession();
  if (!session) return { response: errorResponse("Unauthorized", 401) };
  return { session };
}

/**
 * Require session and that the user is in a company (companyId set).
 * Use for routes that need a company context (cars, reservations, users, etc.).
 * @returns {{ session: Object } | { response: NextResponse }}
 */
export async function requireCompany() {
  const out = await requireSession();
  if ("response" in out) return out;
  if (!out.session.companyId) {
    return { response: errorResponse("Join or create a company first", 403) };
  }
  try {
    await getTenantConfig(out.session.companyId);
  } catch (err) {
    return {
      response: errorResponse(
        err?.message || "Company tenant database is not ready",
        503,
        { code: "TENANT_DB_NOT_READY" }
      ),
    };
  }
  return out;
}

/**
 * Require session and that the user is ADMIN for their company.
 * @returns {{ session: Object } | { response: NextResponse }}
 */
export async function requireAdmin() {
  const out = await requireCompany();
  if ("response" in out) return out;
  const admin = await isCompanyAdmin(out.session.userId, out.session.companyId);
  if (!admin) return { response: errorResponse("Forbidden", 403) };
  return out;
}
