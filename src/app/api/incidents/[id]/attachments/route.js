/**
 * POST /api/incidents/[id]/attachments — append files to an existing incident
 */
import { requireCompany, jsonResponse, errorResponse, requireTrustedOriginForMutation } from "@/lib/api-helpers";
import { getTenantPrisma } from "@/lib/tenant-db";
import { persistIncidentAttachment } from "@/lib/incident-storage";
import { incidentAttachmentUrlForApi } from "@/lib/incident-ref";

export const runtime = "nodejs";
export const maxDuration = 60;

function fileKind(file) {
  const ct = String(file?.type || "").toLowerCase();
  if (ct.startsWith("image/")) return "PHOTO";
  if (ct.includes("pdf") || ct.includes("word") || ct.includes("officedocument")) return "DOCUMENT";
  return "OTHER";
}

export async function POST(request, { params }) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  const out = await requireCompany();
  if ("response" in out) return out.response;

  const { id } = await params;
  const tenant = await getTenantPrisma(out.session.companyId);
  const isAdmin = out.session.role === "ADMIN";

  const incident = await tenant.incidentReport.findFirst({
    where: { id, companyId: out.session.companyId },
    select: { id: true, userId: true },
  });
  if (!incident) return errorResponse("Not found", 404);
  if (!isAdmin && incident.userId !== out.session.userId) return errorResponse("Forbidden", 403);

  let form;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("Expected multipart/form-data", 422);
  }

  const files = form.getAll("files");
  const created = [];
  for (const f of files) {
    if (!f || typeof f === "string") continue;
    const buf = Buffer.from(await f.arrayBuffer());
    if (!buf.length) continue;
    const name = f.name || "file";
    const contentType = f.type || "application/octet-stream";
    const kind = fileKind(f);
    const stored = await persistIncidentAttachment(buf, {
      incidentId: incident.id,
      filename: name,
      contentType,
      actorRole: out.session.role,
      uploadedAt: new Date(),
      kind,
    });
    const att = await tenant.incidentAttachment.create({
      data: {
        id: `${incident.id}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        companyId: out.session.companyId,
        incidentId: incident.id,
        kind,
        filename: name,
        contentType,
        sizeBytes: buf.length,
        blobUrl: stored,
      },
    });
    created.push(att);
  }

  return jsonResponse({
    ok: true,
    added: created.length,
    attachments: created.map((a) => ({
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

