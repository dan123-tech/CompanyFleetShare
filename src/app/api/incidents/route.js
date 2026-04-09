/**
 * GET /api/incidents — list incidents (user: own; admin: company-wide)
 * POST /api/incidents — create incident (user)
 */
import { z } from "zod";
import { requireCompany, jsonResponse, errorResponse } from "@/lib/api-helpers";
import { getTenantPrisma } from "@/lib/tenant-db";
import { persistIncidentAttachment } from "@/lib/incident-storage";
import { incidentAttachmentUrlForApi } from "@/lib/incident-ref";
import { sendIncidentAdminEmail } from "@/lib/incidents-email";

export const runtime = "nodejs";
export const maxDuration = 60;

const postFieldsSchema = z.object({
  carId: z.string().min(1),
  occurredAt: z.string().datetime().optional(),
  severity: z.enum(["A", "B", "C"]).optional(),
  title: z.string().min(3).max(140),
  description: z.string().max(8000).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  reservationId: z.string().max(100).optional().nullable(),
});

function fileKind(file) {
  const ct = String(file?.type || "").toLowerCase();
  if (ct.startsWith("image/")) return "PHOTO";
  if (ct.includes("pdf") || ct.includes("word") || ct.includes("officedocument")) return "DOCUMENT";
  return "OTHER";
}

export async function GET(request) {
  const out = await requireCompany();
  if ("response" in out) return out.response;

  const tenant = await getTenantPrisma(out.session.companyId);
  const isAdmin = out.session.role === "ADMIN";

  const list = await tenant.incidentReport.findMany({
    where: {
      companyId: out.session.companyId,
      ...(isAdmin ? {} : { userId: out.session.userId }),
    },
    include: {
      car: { select: { id: true, brand: true, model: true, registrationNumber: true } },
      user: { select: { id: true, name: true, email: true } },
      attachments: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return jsonResponse(
    list.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      carId: r.carId,
      userId: r.userId,
      reservationId: r.reservationId,
      occurredAt: r.occurredAt,
      title: r.title,
      description: r.description,
      location: r.location,
      status: r.status,
      adminNotes: isAdmin ? r.adminNotes : null,
      createdAt: r.createdAt,
      car: r.car,
      user: r.user,
      attachments: (r.attachments || []).map((a) => ({
        id: a.id,
        kind: a.kind,
        filename: a.filename,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes,
        url: incidentAttachmentUrlForApi(a.blobUrl, a.id),
        createdAt: a.createdAt,
      })),
      severity: r.severity || "C",
    }))
  );
}

export async function POST(request) {
  const out = await requireCompany();
  if ("response" in out) return out.response;

  let form;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("Expected multipart/form-data", 422);
  }

  const raw = {
    carId: String(form.get("carId") || "").trim(),
    occurredAt: String(form.get("occurredAt") || "").trim() || undefined,
    severity: String(form.get("severity") || "").trim() || undefined,
    title: String(form.get("title") || "").trim(),
    description: String(form.get("description") || "").trim() || null,
    location: String(form.get("location") || "").trim() || null,
    reservationId: String(form.get("reservationId") || "").trim() || null,
  };
  const parsed = postFieldsSchema.safeParse(raw);
  if (!parsed.success) return errorResponse("Invalid input", 422);

  const tenant = await getTenantPrisma(out.session.companyId);
  const car = await tenant.car.findFirst({
    where: { id: parsed.data.carId, companyId: out.session.companyId },
    select: { id: true, brand: true, model: true, registrationNumber: true },
  });
  if (!car) return errorResponse("Car not found", 404);

  const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date();
  const severity = parsed.data.severity || "C";

  const incident = await tenant.incidentReport.create({
    data: {
      id: `${out.session.companyId}_${out.session.userId}_${Date.now()}`,
      companyId: out.session.companyId,
      carId: car.id,
      userId: out.session.userId,
      reservationId: parsed.data.reservationId || null,
      occurredAt,
      severity,
      title: parsed.data.title,
      description: parsed.data.description || null,
      location: parsed.data.location || null,
      status: "SUBMITTED",
    },
  });

  // Severity A => make car unavailable (IN_MAINTENANCE).
  if (severity === "A") {
    await tenant.car.updateMany({
      where: { id: car.id, companyId: out.session.companyId },
      data: { status: "IN_MAINTENANCE" },
    });
  }

  const files = form.getAll("files");
  const attachments = [];
  for (const f of files) {
    if (!f || typeof f === "string") continue;
    const buf = Buffer.from(await f.arrayBuffer());
    if (!buf.length) continue;
    const kind = fileKind(f);
    const stored = await persistIncidentAttachment(buf, {
      incidentId: incident.id,
      filename: f.name || "file",
      contentType: f.type || "application/octet-stream",
      actorRole: out.session.role,
      uploadedAt: new Date(),
      kind,
    });
    const att = await tenant.incidentAttachment.create({
      data: {
        id: `${incident.id}_${attachments.length}_${Date.now()}`,
        companyId: out.session.companyId,
        incidentId: incident.id,
        kind,
        filename: f.name || "file",
        contentType: f.type || "application/octet-stream",
        sizeBytes: buf.length,
        blobUrl: stored,
      },
    });
    attachments.push(att);
  }

  // Notify admins best-effort.
  try {
    const mail = await sendIncidentAdminEmail(out.session.companyId, { incidentId: incident.id });
    if (!mail?.ok) {
      console.warn("[incidents] admin email not sent", {
        companyId: out.session.companyId,
        incidentId: incident.id,
        error: mail?.error,
      });
    }
  } catch (e) {
    console.warn("[incidents] admin email threw", {
      companyId: out.session.companyId,
      incidentId: incident.id,
      error: e?.message || String(e),
    });
  }

  return jsonResponse(
    {
      ok: true,
      id: incident.id,
      status: incident.status,
      attachmentCount: attachments.length,
    },
    201
  );
}

