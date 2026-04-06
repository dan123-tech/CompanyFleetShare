/**
 * PATCH /api/users/me/password
 * Body: { currentPassword, newPassword }
 * Clears mustChangePassword after a successful change.
 */

import { z } from "zod";
import { getSession } from "@/lib/auth";
import { verifyPassword, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";
import { assertTrustedRequestOrigin } from "@/lib/security/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function PATCH(request) {
  const originCheck = assertTrustedRequestOrigin(request);
  if (!originCheck.ok) return errorResponse(originCheck.reason, 403);

  let session;
  try {
    session = await getSession();
  } catch (e) {
    console.error("[users/me/password] getSession:", e);
    return errorResponse("Session check failed.", 503);
  }
  if (!session?.userId) return errorResponse("Unauthorized", 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON", 422);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error?.errors?.[0]?.message || "Invalid input";
    return errorResponse(msg, 422);
  }
  const { currentPassword, newPassword } = parsed.data;

  const row = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { password: true },
  });
  if (!row) return errorResponse("User not found", 404);

  const ok = await verifyPassword(currentPassword, row.password);
  if (!ok) return errorResponse("Current password is incorrect", 401);

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      password: await hashPassword(newPassword),
      mustChangePassword: false,
    },
  });

  return jsonResponse({ ok: true, mustChangePassword: false });
}
