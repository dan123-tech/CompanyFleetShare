/**
 * POST /api/auth/mfa-verify
 * Body: { email, code, clientType? }
 * Completes login after password + email MFA code.
 */

import { z } from "zod";
import { findUserByEmail } from "@/lib/users";
import { errorResponse } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { buildLoginSuccessResponse } from "@/lib/auth/issue-login-session";
import { hashMfaOtp, timingSafeEqualHex, MFA_MAX_ATTEMPTS } from "@/lib/auth/mfa-otp";
import { assertTrustedRequestOrigin } from "@/lib/security/csrf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(12),
  clientType: z.enum(["web", "mobile"]).optional(),
});

async function clearMfaOtp(userId) {
  await prisma.user.update({
    where: { id: userId },
    data: { mfaOtpHash: null, mfaOtpExpiresAt: null, mfaOtpAttempts: 0 },
  });
}

export async function POST(request) {
  const originCheck = assertTrustedRequestOrigin(request);
  if (!originCheck.ok) return errorResponse(originCheck.reason, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 422);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return errorResponse("Invalid input", 422);

  const { email, code } = parsed.data;
  const headerClient = request.headers.get("x-client-type");
  const clientType =
    parsed.data.clientType === "mobile" || (headerClient && headerClient.toLowerCase() === "mobile")
      ? "mobile"
      : "web";

  const user = await findUserByEmail(email);
  if (!user?.mfaEnabled) return errorResponse("Invalid request", 400);

  if (!user.mfaOtpHash || !user.mfaOtpExpiresAt) {
    return errorResponse("No active code. Sign in again with your password.", 401);
  }

  if (user.mfaOtpExpiresAt < new Date()) {
    await clearMfaOtp(user.id);
    return errorResponse("Code expired. Sign in again with your password.", 401);
  }

  if ((user.mfaOtpAttempts ?? 0) >= MFA_MAX_ATTEMPTS) {
    await clearMfaOtp(user.id);
    return errorResponse("Too many attempts. Sign in again with your password.", 429);
  }

  const expected = user.mfaOtpHash;
  const candidate = hashMfaOtp(user.id, code.trim());
  if (!timingSafeEqualHex(expected, candidate)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaOtpAttempts: { increment: 1 } },
    });
    return errorResponse("Invalid code", 401);
  }

  await clearMfaOtp(user.id);
  return buildLoginSuccessResponse(
    { id: user.id, email: user.email, name: user.name },
    clientType,
    request
  );
}
