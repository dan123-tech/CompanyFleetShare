/**
 * GET /api/incidents/attachments/[id] — stream incident attachment (private blob/local).
 */
import { requireCompany, errorResponse } from "@/lib/api-helpers";
import { getTenantPrisma } from "@/lib/tenant-db";
import { incidentAttachmentResponse } from "@/lib/incident-serve";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  const out = await requireCompany();
  if ("response" in out) return out.response;
  const { id } = await params;

  const tenant = await getTenantPrisma(out.session.companyId);
  const isAdmin = out.session.role === "ADMIN";

  const row = await tenant.incidentAttachment.findFirst({
    where: { id, companyId: out.session.companyId },
    include: { incident: { select: { userId: true } } },
  });
  if (!row) return errorResponse("Not found", 404);
  if (!isAdmin && row.incident?.userId !== out.session.userId) return errorResponse("Forbidden", 403);

  return incidentAttachmentResponse(row.blobUrl, request);
}

