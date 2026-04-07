/**
 * PATCH /api/users/me/notifications — email preferences for booking events.
 * Body: { emailBookingNotifications: boolean }
 */

import { z } from "zod";
import { getSession } from "@/lib/auth";
import { updateUserEmailBookingNotifications } from "@/lib/users";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";

export const runtime = "nodejs";

const bodySchema = z.object({
  emailBookingNotifications: z.boolean(),
});

export async function PATCH(request) {
  const session = await getSession();
  if (!session?.userId) return errorResponse("Unauthorized", 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON", 422);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return errorResponse("Invalid input", 422);

  const row = await updateUserEmailBookingNotifications(session.userId, parsed.data.emailBookingNotifications);
  return jsonResponse({ emailBookingNotifications: row.emailBookingNotifications });
}
