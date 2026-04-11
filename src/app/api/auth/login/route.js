/**
 * POST /api/auth/login
 * Body: { email, password, clientType? }
 * Sets session cookie unless MFA is enabled (then returns mfaRequired + sends email code).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail } from "@/lib/users";
import { verifyPassword } from "@/lib/auth";
import { normalizeClientType } from "@/lib/auth/session-tokens";
import { errorResponse, rateLimitResponse } from "@/lib/api-helpers";
import { clientIpFromRequest } from "@/lib/security/client-ip";
import {
  assertLoginAuthNotRateLimited,
  normalizeEmailForRateLimit,
  recordLoginAuthFailure,
} from "@/lib/security/rate-limit-auth";
import {
  isUserLoginLocked,
  loginLockRetryAfterSec,
  logLoginFailure,
  recordPasswordLoginFailure,
  clearPasswordLoginFailures,
} from "@/lib/security/login-lockout";
import { prisma } from "@/lib/db";
import { buildLoginSuccessResponse } from "@/lib/auth/issue-login-session";
import {
  generateSixDigitCode,
  hashMfaOtp,
  MFA_OTP_TTL_MS,
} from "@/lib/auth/mfa-otp";
import { sendMfaLoginCodeEmail } from "@/lib/email";
import { assertTrustedRequestOrigin } from "@/lib/security/csrf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  clientType: z.enum(["web", "mobile"]).optional(),
});

function loginErrorResponse(e) {
  const msg = String(e?.message ?? e);
  const code = e?.code;
  const debugLogin = process.env.API_DEBUG_LOGIN === "1";
  const debugExtra = debugLogin
    ? {
        hint: msg.slice(0, 400),
        errorName: e?.name || null,
        cause: e?.cause ? String(e.cause).slice(0, 400) : null,
        stackTop: typeof e?.stack === "string" ? e.stack.split("\n").slice(0, 6).join("\n") : null,
      }
    : {};
  if (msg.includes("DATABASE_URL is not set")) {
    return errorResponse(msg, 503, { code: "MISSING_DATABASE_URL", ...debugExtra });
  }
  if (msg.includes("AUTH_SECRET")) {
    return errorResponse(
      "Server configuration: set AUTH_SECRET in your .env file (at least 32 characters). Example: openssl rand -base64 32 — then restart the dev server.",
      503
    );
  }
  if (
    code === "P1001" ||
    msg.includes("Can't reach database server") ||
    msg.includes("ECONNREFUSED")
  ) {
    return errorResponse(
      "Database is not running or DATABASE_URL is wrong. On your PC (not inside Docker), use localhost in DATABASE_URL. Start Postgres (e.g. docker compose up -d db) and use: postgresql://postgres:postgres@localhost:5432/company_car_sharing?schema=public",
      503
    );
  }
  if (
    code === "P2024" ||
    code === "P1017" ||
    code === "P2037" ||
    msg.includes("Timed out fetching a new connection") ||
    msg.includes("Server has closed the connection")
  ) {
    return errorResponse(
      "Database connection timed out or pool exhausted. On Vercel + Neon: use Neon’s pooled DATABASE_URL, add ?sslmode=require if missing, redeploy; check Neon project is not paused.",
      503,
      { prismaCode: code }
    );
  }
  if (code === "P2021" || code === "P2022") {
    return errorResponse(
      "Database schema is out of date. Run: npx prisma migrate deploy (against the same DATABASE_URL as production), then redeploy.",
      503,
      { prismaCode: code }
    );
  }
  if (
    msg.includes("Unknown argument") &&
    (msg.includes("activeWebSessionToken") || msg.includes("activeMobileSessionToken"))
  ) {
    return errorResponse(
      "Session support is out of date on this server. Stop the app, run: npx prisma generate (and npx prisma migrate deploy if needed), then start again.",
      503
    );
  }
  const isDev = process.env.NODE_ENV !== "production";
  const suffix = isDev && msg ? ` — ${msg.slice(0, 400)}` : "";
  const prismaExtra = code && String(code).startsWith("P") ? { prismaCode: code } : {};
  const nameExtra =
    !prismaExtra.prismaCode && e?.name && e.name !== "Error" ? { errorName: e.name } : {};
  if (prismaExtra.prismaCode) {
    return errorResponse(`Login failed${suffix}`, 500, { ...prismaExtra, ...debugExtra });
  }
  return errorResponse(`Login failed${suffix}`, 500, { ...nameExtra, ...debugExtra });
}

export async function POST(request) {
  try {
    const originCheck = assertTrustedRequestOrigin(request);
    if (!originCheck.ok) return errorResponse(originCheck.reason, 403);

    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", 422);
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid email or password", 422);
    }
    const { email, password, clientType: bodyClient } = parsed.data;
    const headerClient = request.headers.get("x-client-type");
    const clientType =
      bodyClient === "mobile" || (headerClient && headerClient.toLowerCase() === "mobile") ? "mobile" : "web";

    const emailNorm = normalizeEmailForRateLimit(email);
    const ip = clientIpFromRequest(request);
    const rl = await assertLoginAuthNotRateLimited(ip, emailNorm);
    if (!rl.ok) {
      return rateLimitResponse("Too many sign-in attempts. Please try again later.", rl.retryAfterSec);
    }

    const user = await findUserByEmail(email);
    if (!user) {
      await recordLoginAuthFailure(ip, emailNorm);
      logLoginFailure({
        reason: "invalid_credentials_unknown_user",
        emailNorm,
        userId: null,
        ip,
      });
      return errorResponse("Invalid credentials", 401);
    }

    if (isUserLoginLocked(user)) {
      logLoginFailure({
        reason: "login_blocked_account_locked",
        emailNorm,
        userId: user.id,
        ip,
        extra: { retryAfterSec: loginLockRetryAfterSec(user) },
      });
      return rateLimitResponse(
        "Account temporarily locked after too many failed sign-in attempts. Try again later.",
        loginLockRetryAfterSec(user),
      );
    }

    const ok = await verifyPassword(password, user.password);
    if (!ok) {
      await recordLoginAuthFailure(ip, emailNorm);
      await recordPasswordLoginFailure(user.id, emailNorm, ip);
      return errorResponse("Invalid credentials", 401);
    }

    await clearPasswordLoginFailures(user.id);

    const client = normalizeClientType(clientType);

    if (user.mfaEnabled) {
      const code = generateSixDigitCode();
      const hash = hashMfaOtp(user.id, code);
      const expires = new Date(Date.now() + MFA_OTP_TTL_MS);
      await prisma.user.update({
        where: { id: user.id },
        data: { mfaOtpHash: hash, mfaOtpExpiresAt: expires, mfaOtpAttempts: 0 },
      });
      const sent = await sendMfaLoginCodeEmail({ to: user.email, code });
      if (!sent.ok) {
        await prisma.user.update({
          where: { id: user.id },
          data: { mfaOtpHash: null, mfaOtpExpiresAt: null, mfaOtpAttempts: 0 },
        });
        return errorResponse(
          "Could not send sign-in code. Check RESEND_API_KEY and EMAIL_FROM, then try again.",
          503
        );
      }
      return NextResponse.json({
        mfaRequired: true,
        email: user.email,
        clientType: client,
      });
    }

    return buildLoginSuccessResponse(
      { id: user.id, email: user.email, name: user.name },
      clientType,
      request
    );
  } catch (e) {
    console.error("[auth/login]", e);
    return loginErrorResponse(e);
  }
}
