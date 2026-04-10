/**
 * POST /api/auth/logout
 * Clears the session cookie.
 */

import { clearSession } from "@/lib/auth";
import { jsonResponse, requireTrustedOriginForMutation } from "@/lib/api-helpers";

export const runtime = "nodejs";

export async function POST(request) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  await clearSession();
  return jsonResponse({ ok: true });
}
