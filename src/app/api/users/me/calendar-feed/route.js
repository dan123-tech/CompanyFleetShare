/**
 * GET — return subscribe URL (creates token if missing)
 * POST — rotate token (invalidates old calendar URLs)
 * DELETE — disable feed (clear token)
 */

import { getSession } from "@/lib/auth";
import {
  ensureCalendarFeedToken,
  rotateCalendarFeedToken,
  clearCalendarFeedToken,
} from "@/lib/users";
import { jsonResponse, errorResponse, requireTrustedOriginForMutation } from "@/lib/api-helpers";

export const runtime = "nodejs";

function absoluteOrigin() {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  return base || "";
}

export async function GET() {
  const session = await getSession();
  if (!session?.userId) return errorResponse("Unauthorized", 401);
  const token = await ensureCalendarFeedToken(session.userId);
  const origin = absoluteOrigin();
  if (!origin) {
    return jsonResponse({
      feedUrl: `/api/calendar/feed?token=${encodeURIComponent(token)}`,
      relative: true,
    });
  }
  return jsonResponse({
    feedUrl: `${origin}/api/calendar/feed?token=${encodeURIComponent(token)}`,
    relative: false,
  });
}

export async function POST(request) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  const session = await getSession();
  if (!session?.userId) return errorResponse("Unauthorized", 401);
  const token = await rotateCalendarFeedToken(session.userId);
  const origin = absoluteOrigin();
  const feedUrl = origin
    ? `${origin}/api/calendar/feed?token=${encodeURIComponent(token)}`
    : `/api/calendar/feed?token=${encodeURIComponent(token)}`;
  return jsonResponse({ feedUrl, rotated: true });
}

export async function DELETE(request) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  const session = await getSession();
  if (!session?.userId) return errorResponse("Unauthorized", 401);
  await clearCalendarFeedToken(session.userId);
  return jsonResponse({ ok: true });
}
