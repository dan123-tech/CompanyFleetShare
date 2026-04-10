/**
 * PATCH /api/incidents/[id] — admin updates (status, adminNotes)
 */
import { z } from "zod";
import { requireCompany, errorResponse, jsonResponse, requireTrustedOriginForMutation } from "@/lib/api-helpers";
import { getTenantPrisma } from "@/lib/tenant-db";
import { incidentAttachmentUrlForApi } from "@/lib/incident-ref";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.string().max(40).optional(),
  severity: z.enum(["A", "B", "C"]).optional(),
  adminNotes: z.string().max(8000).optional().nullable(),
});

export async function GET(_request, { params }) {
  const out = await requireCompany();
  if ("response" in out) return out.response;

  const { id } = await params;
  const tenant = await getTenantPrisma(out.session.companyId);
  const isAdmin = out.session.role === "ADMIN";

  const row = await tenant.incidentReport.findFirst({
    where: {
      id,
      companyId: out.session.companyId,
      ...(isAdmin ? {} : { userId: out.session.userId }),
    },
    include: {
      car: { select: { id: true, brand: true, model: true, registrationNumber: true } },
      user: { select: { id: true, name: true, email: true } },
      attachments: true,
    },
  });
  if (!row) return errorResponse("Not found", 404);

  return jsonResponse({
    id: row.id,
    companyId: row.companyId,
    carId: row.carId,
    userId: row.userId,
    reservationId: row.reservationId,
    occurredAt: row.occurredAt,
    severity: row.severity || "C",
    title: row.title,
    description: row.description,
    location: row.location,
    status: row.status,
    adminNotes: isAdmin ? row.adminNotes : null,
    createdAt: row.createdAt,
    car: row.car,
    user: row.user,
    attachments: (row.attachments || []).map((a) => ({
      id: a.id,
      kind: a.kind,
      filename: a.filename,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
      url: incidentAttachmentUrlForApi(a.blobUrl, a.id),
      createdAt: a.createdAt,
    })),
  });
}

export async function PATCH(request, { params }) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
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
    select: { id: true, carId: true },
  });
  if (!row) return errorResponse("Not found", 404);

  const updated = await tenant.incidentReport.update({
    where: { id },
    data: {
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.severity !== undefined ? { severity: parsed.data.severity } : {}),
      ...(parsed.data.adminNotes !== undefined ? { adminNotes: parsed.data.adminNotes || null } : {}),
    },
  });

  // Severity A => make car unavailable (IN_MAINTENANCE).
  if (parsed.data.severity === "A") {
    await tenant.car.updateMany({
      where: { id: row.carId, companyId: out.session.companyId },
      data: { status: "IN_MAINTENANCE" },
    });
  }

  return jsonResponse({ ok: true, id: updated.id, status: updated.status });
}

