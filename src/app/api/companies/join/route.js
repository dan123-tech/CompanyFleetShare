/**
 * POST /api/companies/join – join a company by join code.
 * Body: { joinCode }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { joinCompanyByCode } from "@/lib/companies";
import { extendUserSession } from "@/lib/auth";
import { normalizeClientType } from "@/lib/auth/session-tokens";
import { requireSession, errorResponse, requireTrustedOriginForMutation } from "@/lib/api-helpers";

const bodySchema = z.object({
  joinCode: z.string().min(1).max(20),
});

export async function POST(request) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  const out = await requireSession();
  if ("response" in out) return out.response;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("Invalid input", 422);

  const member = await joinCompanyByCode(out.session.userId, parsed.data.joinCode);
  if (!member) {
    return errorResponse("Invalid join code or you are already a member", 400);
  }

  const payload = {
    company: {
      id: member.company.id,
      name: member.company.name,
      domain: member.company.domain,
      joinCode: member.company.joinCode,
    },
    role: member.role,
    message: "You have joined the company.",
  };
  const res = NextResponse.json(payload);
  const sid = await extendUserSession(
    out.session,
    {
      companyId: member.companyId,
      role: member.role,
    },
    request,
    res
  );
  if (normalizeClientType(out.session.client) === "web") {
    return NextResponse.json({ ...payload, webSessionId: sid }, { headers: res.headers });
  }
  return res;
}
