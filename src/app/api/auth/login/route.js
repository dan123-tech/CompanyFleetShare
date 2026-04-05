/**
 * POST /api/auth/login
 * Body: { email, password }
 * Sets session cookie and returns user + company (company null if user has not joined/created one yet).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail } from "@/lib/users";
import { verifyPassword, writeSessionCookie } from "@/lib/auth";
import { normalizeClientType, rotateUserSessionToken } from "@/lib/auth/session-tokens";
import { getCompanyById } from "@/lib/companies";
import { errorResponse } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  /** "web" (default): one browser session; "mobile": separate slot so phone + laptop can both stay logged in */
  clientType: z.enum(["web", "mobile"]).optional(),
});

export async function POST(request) {
  try {
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

    const user = await findUserByEmail(email);
    if (!user) return errorResponse("Invalid credentials", 401);

    const ok = await verifyPassword(password, user.password);
    if (!ok) return errorResponse("Invalid credentials", 401);

    // If a user belongs to more than one company, prefer the oldest membership (first joined/created).
    // Use findMany + sort in JS instead of findFirst+orderBy — Turbopack dev bundles have triggered
    // "Invalid findFirst() invocation" for some setups; this query shape is equivalent and stable.
    const enrolled = await prisma.companyMember.findMany({
      where: { userId: user.id, status: "ENROLLED" },
      include: { company: true },
    });
    const member =
      enrolled.length === 0
        ? null
        : [...enrolled].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];

    const client = normalizeClientType(clientType);

    if (member) {
      const sid = await rotateUserSessionToken(user.id, client);
      const company = await getCompanyById(member.companyId);
      const payload = {
        user: { id: user.id, email: user.email, name: user.name, role: member.role, companyId: member.companyId },
        company: company ? { id: company.id, name: company.name, domain: company.domain, joinCode: company.joinCode } : null,
      };
      if (client === "web") payload.webSessionId = sid;
      const res = NextResponse.json(payload);
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

    const sid = await rotateUserSessionToken(user.id, client);
    const payload = {
      user: { id: user.id, email: user.email, name: user.name, role: null, companyId: null },
      company: null,
    };
    if (client === "web") payload.webSessionId = sid;
    const res = NextResponse.json(payload);
    await writeSessionCookie(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        companyId: null,
        role: null,
        client,
        sid,
      },
      request,
      res
    );
    return res;
  } catch (e) {
    console.error("[auth/login]", e);
    const msg = String(e?.message ?? e);
    const code = e?.code;
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
      msg.includes("Unknown argument") &&
      (msg.includes("activeWebSessionToken") || msg.includes("activeMobileSessionToken"))
    ) {
      return errorResponse(
        "Session support is out of date on this server. Stop the app, run: npx prisma generate (and npx prisma migrate deploy if needed), then start again.",
        503
      );
    }
    // In development, surface the real error in JSON so the browser / Network tab shows the cause
    // (AUTH_SECRET, DB, Prisma, etc.). Production stays generic.
    const isDev = process.env.NODE_ENV !== "production";
    const suffix = isDev && msg ? ` — ${msg.slice(0, 400)}` : "";
    return errorResponse(`Login failed${suffix}`, 500);
  }
}
