/**
 * PATCH /api/incidents/[id] — admin updates (status, adminNotes)
 */
import { z } from "zod";
import { requireCompany, errorResponse, jsonResponse } from "@/lib/api-helpers";
import { getTenantPrisma } from "@/lib/tenant-db";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.string().max(40).optional(),
  adminNotes: z.string().max(8000).optional().nullable(),
});

export async function PATCH(request, { params }) {
  const out = await requireCompany();
  if ("response" in out) return out.response;
  if (out.session.role !== "ADMIN") return errorResponse("Forbidden", 403);

  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON", 422);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return errorResponse("Invalid input", 422);

  const tenant = await getTenantPrisma(out.session.companyId);
  const row = await tenant.incidentReport.findFirst({
    where: { id, companyId: out.session.companyId },
    select: { id: true },
  });
  if (!row) return errorResponse("Not found", 404);

  const updated = await tenant.incidentReport.update({
    where: { id },
    data: {
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.adminNotes !== undefined ? { adminNotes: parsed.data.adminNotes || null } : {}),
    },
  });

  return jsonResponse({ ok: true, id: updated.id, status: updated.status });
}

