/**
 * POST /api/auth/register
 * Body: { email, password, name }
 * Creates a new user account. No company or invite – user can log in and join a company later (e.g. via invite from admin).
 */

import { z } from "zod";
import { findUserByEmail, createUser } from "@/lib/users";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";
import { sendWelcomeEmail } from "@/lib/email";
import { assertTrustedRequestOrigin } from "@/lib/security/csrf";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(200),
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
  const { email, password, name } = parsed.data;

  const existing = await findUserByEmail(email);
  if (existing) return errorResponse("Email already registered", 409);

  const user = await createUser({ email, password, name });

  // Must await: Vercel / Workers often freeze the isolate right after the response is sent,
  // so fire-and-forget .then() never runs and no email is sent.
  try {
    const sent = await sendWelcomeEmail({ to: user.email, name: user.name });
    if (!sent.ok) {
      console.error("[auth/register] welcome email failed:", sent.error);
    }
  } catch (e) {
    console.error("[auth/register] welcome email exception:", e);
  }

  return jsonResponse(
    { user: { id: user.id, email: user.email, name: user.name } },
    201
  );
}
