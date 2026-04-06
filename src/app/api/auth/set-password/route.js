/**
 * POST /api/auth/set-password
 * Body: { token, newPassword }
 * For invite flow: set password and enroll (token = invite token).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getInviteByToken, acceptInvite, findUserByEmail } from "@/lib/users";
import { hashPassword, writeSessionCookie } from "@/lib/auth";
import { normalizeClientType, rotateUserSessionToken } from "@/lib/auth/session-tokens";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-helpers";
import { assertTrustedRequestOrigin } from "@/lib/security/csrf";

const bodySchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(request) {
  const originCheck = assertTrustedRequestOrigin(request);
  if (!originCheck.ok) return errorResponse(originCheck.reason, 403);

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    let msg = "Invalid input";
    try {
      const err = parsed.error;
      if (err?.errors?.[0]?.message) msg = err.errors[0].message;
    } catch (_) {}
    return errorResponse(msg, 422);
  }
  const { token, newPassword } = parsed.data;

  const invite = await getInviteByToken(token);
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return errorResponse("Invalid or expired token", 400);
  }

  let user = await findUserByEmail(invite.email);
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { password: await hashPassword(newPassword), mustChangePassword: false },
    });
  } else {
    user = await prisma.user.create({
      data: {
        email: invite.email,
        password: await hashPassword(newPassword),
        name: invite.email.split("@")[0],
        mustChangePassword: false,
      },
    });
  }

  const member = await acceptInvite(token, user.id);
  if (!member) return errorResponse("Could not enroll", 400);

  const client = normalizeClientType("web");
  const sid = await rotateUserSessionToken(user.id, client);
  const body = {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: member.role,
      companyId: member.companyId,
      mustChangePassword: false,
    },
    company: { id: member.company.id, name: member.company.name },
    webSessionId: sid,
  };
  const res = NextResponse.json(body);
  await writeSessionCookie(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      companyId: member.companyId,
      role: member.role,
      client,
      sid,
    },
    request,
    res
  );
  return res;
}
