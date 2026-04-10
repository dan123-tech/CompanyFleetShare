/**
 * POST /api/users/invite – (admin) invite user by email
 * Body: { email, name?, role? }
 */

import { z } from "zod";
import { createInvite } from "@/lib/users";
import { requireAdmin, jsonResponse, errorResponse, requireTrustedOriginForMutation } from "@/lib/api-helpers";
import { sendInviteEmail } from "@/lib/email";

const bodySchema = z.object({
  email: z.string().email(),
  name: z.string().max(200).optional(),
  role: z.enum(["ADMIN", "USER"]).optional().default("USER"),
});

export async function POST(request) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  const out = await requireAdmin();
  if ("response" in out) return out.response;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("Invalid input", 422);
  const invite = await createInvite(
    out.session.companyId,
    parsed.data.email,
    parsed.data.role,
    parsed.data.name
  );

  let emailSent = false;
  try {
    const mail = await sendInviteEmail({
      to: invite.email,
      token: invite.token,
      inviteeName: parsed.data.name,
    });
    emailSent = mail.ok === true;
    if (!mail.ok && mail.error !== "not_configured") {
      console.error("[invite] email:", mail.error);
    }
  } catch (e) {
    console.error("[invite] email:", e);
  }

  return jsonResponse(
    {
      inviteId: invite.id,
      token: invite.token,
      email: invite.email,
      expiresAt: invite.expiresAt,
      emailSent,
      message: emailSent
        ? "Invite created and an email was sent."
        : "Invite created. Configure RESEND_API_KEY + EMAIL_FROM to send mail, or share the token manually.",
    },
    201
  );
}
