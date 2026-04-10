import { z } from "zod";
import { getSession } from "@/lib/auth";
import { jsonResponse, errorResponse, requireTrustedOriginForMutation } from "@/lib/api-helpers";
import { clientIpFromRequest } from "@/lib/security/client-ip";
import { prisma } from "@/lib/db";
import {
  assertMobileSessionRateLimit,
  buildMobileCaptureUrl,
  createMobileCaptureSession,
  markMobileCaptureSessionEmailSent,
} from "@/lib/mobile-capture-sessions";
import { sendMobileCaptureLinkEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sendEmail: z.boolean().optional(),
});

export async function POST(request) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  const session = await getSession();
  if (!session?.userId) return errorResponse("Unauthorized", 401);
  if (!session.companyId) {
    return errorResponse("Join or create a company first", 403);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return errorResponse("Invalid input", 422);

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      drivingLicenceUrl: true,
    },
  });
  if (!user) return errorResponse("User not found", 404);
  if (!user.drivingLicenceUrl) {
    return errorResponse("Driving licence image is required first.", 422);
  }

  try {
    await assertMobileSessionRateLimit(session.userId);
  } catch (e) {
    return errorResponse(e?.message || "Too many requests", 429);
  }

  const created = await createMobileCaptureSession({
    userId: session.userId,
    companyId: session.companyId,
    ipAddress: clientIpFromRequest(request),
    userAgent: request.headers.get("user-agent") || null,
  });
  const captureUrl = buildMobileCaptureUrl(created.token, request.url);

  let email = null;
  if (parsed.data.sendEmail) {
    const out = await sendMobileCaptureLinkEmail({
      to: user.email,
      name: user.name,
      captureUrl,
      expiresAt: created.expiresAt,
    });
    if (out.ok) {
      await markMobileCaptureSessionEmailSent(created.id);
      email = { sent: true };
    } else {
      email = { sent: false, error: out.error || "email_failed" };
    }
  }

  return jsonResponse({
    token: created.token,
    captureUrl,
    expiresAt: created.expiresAt,
    email,
  });
}
