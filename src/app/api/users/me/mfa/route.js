/**
 * PATCH /api/users/me/mfa
 * Body: { enabled: boolean, password: string }
 * Turn email MFA on or off (requires current password).
 */

import { z } from "zod";
import { requireSession, jsonResponse, errorResponse, requireTrustedOriginForMutation } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  enabled: z.boolean(),
  password: z.string().min(1),
});

export async function PATCH(request) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  const out = await requireSession();
  if ("response" in out) return out.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 422);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return errorResponse("Invalid input", 422);

  const { enabled, password } = parsed.data;
  const row = await prisma.user.findUnique({
    where: { id: out.session.userId },
    select: { id: true, password: true },
  });
  if (!row) return errorResponse("Unauthorized", 401);

  const ok = await verifyPassword(password, row.password);
  if (!ok) return errorResponse("Invalid password", 401);

  await prisma.user.update({
    where: { id: row.id },
    data: {
      mfaEnabled: enabled,
      mfaOtpHash: null,
      mfaOtpExpiresAt: null,
      mfaOtpAttempts: 0,
    },
  });

  return jsonResponse({ mfaEnabled: enabled });
}
