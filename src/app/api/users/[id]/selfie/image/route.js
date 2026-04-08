import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMembership, isCompanyAdmin } from "@/lib/companies";
import { errorResponse } from "@/lib/api-helpers";
import { selfieImageResponse } from "@/lib/selfie-serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  let session;
  try {
    session = await getSession();
  } catch (e) {
    console.error("[selfie image] getSession:", e);
    return errorResponse("Session check failed.", 503);
  }
  if (!session?.userId) return errorResponse("Unauthorized", 401);

  const { id: targetUserId } = await params;
  if (!targetUserId || typeof targetUserId !== "string") return errorResponse("Invalid user", 400);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { selfieUrl: true },
  });
  const stored = user?.selfieUrl;
  if (!stored) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isSelf = session.userId === targetUserId;
  if (!isSelf) {
    if (!session.companyId) return errorResponse("Forbidden", 403);
    const [admin, member] = await Promise.all([
      isCompanyAdmin(session.userId, session.companyId),
      getMembership(targetUserId, session.companyId),
    ]);
    if (!admin || !member) return errorResponse("Forbidden", 403);
  }

  try {
    return await selfieImageResponse(stored, request);
  } catch (e) {
    console.error("[selfie image] serve failed:", e);
    return errorResponse("Failed to load image", 500);
  }
}

