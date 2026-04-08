/**
 * POST /api/companies – create a new company (logged-in user becomes ADMIN).
 * Returns company with joinCode so others can join.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createCompanyWithTenant } from "@/lib/companies";
import { extendUserSession } from "@/lib/auth";
import { normalizeClientType } from "@/lib/auth/session-tokens";
import { requireSession, errorResponse } from "@/lib/api-helpers";

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  domain: z.string().max(100).optional().nullable(),
});

export async function POST(request) {
  const out = await requireSession();
  if ("response" in out) return out.response;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("Invalid input", 422);
  let company;
  try {
    company = await createCompanyWithTenant(out.session.userId, parsed.data);
  } catch (err) {
    const message =
      err?.message?.slice?.(0, 400) ||
      "Company was created in control-plane but tenant provisioning failed. Check Neon env vars and Vercel logs.";
    return errorResponse(message, 500, { code: "TENANT_PROVISIONING_FAILED" });
  }

  const payload = {
    company: {
      id: company.id,
      name: company.name,
      domain: company.domain,
      joinCode: company.joinCode,
    },
    message: "Share the join code so others can join your company.",
  };
  const res = NextResponse.json(payload, { status: 201 });
  const sid = await extendUserSession(
    out.session,
    {
      companyId: company.id,
      role: "ADMIN",
    },
    request,
    res
  );
  if (normalizeClientType(out.session.client) === "web") {
    return NextResponse.json({ ...payload, webSessionId: sid }, { status: 201, headers: res.headers });
  }
  return res;
}
