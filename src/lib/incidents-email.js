import { getTenantPrisma } from "@/lib/tenant-db";
import { escapeEmailText, sendEmail, wrapBrandedEmailHtml } from "@/lib/email";
import { readFile } from "fs/promises";
import path from "path";
import { get } from "@vercel/blob";
import { resolveBlobReadWriteToken } from "@/lib/blob-env";
import { INCIDENT_PRIVATE_PREFIX, incidentAttachmentUrlForApi } from "@/lib/incident-ref";

function formatOccurred(d) {
  try {
    return new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

async function bufferFromStoredIncidentBlob(stored) {
  const v = String(stored || "");
  if (!v) return null;

  if (v.startsWith("/uploads/incidents/")) {
    const rel = v.slice("/uploads/incidents/".length);
    if (!rel || rel.includes("..") || rel.includes("\\") || rel.includes("%5c")) return null;
    const parts = rel.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const incidentId = parts[0];
    const filename = parts.slice(1).join("/");
    const filepath = path.join(process.cwd(), "public", "uploads", "incidents", incidentId, filename);
    return Buffer.from(await readFile(filepath));
  }

  const token = resolveBlobReadWriteToken();

  if (v.startsWith(INCIDENT_PRIVATE_PREFIX)) {
    const pathname = v.slice(INCIDENT_PRIVATE_PREFIX.length);
    if (!token) return null;
    const result = await get(pathname, { access: "private", token });
    if (!result?.stream) return null;
    const ab = await new Response(result.stream).arrayBuffer();
    return Buffer.from(ab);
  }

  if (v.startsWith("https://") || v.startsWith("http://")) {
    const isPrivate = v.includes(".private.blob.vercel-storage.com");
    const access = isPrivate ? "private" : "public";
    const result = await get(v, { access, ...(token ? { token } : {}) });
    if (!result?.stream) return null;
    const ab = await new Response(result.stream).arrayBuffer();
    return Buffer.from(ab);
  }

  return null;
}

export async function sendIncidentAdminEmail(companyId, { incidentId }) {
  const tenant = await getTenantPrisma(companyId);
  const company = await tenant.company.findUnique({ where: { id: companyId }, select: { name: true } });
  const incident = await tenant.incidentReport.findFirst({
    where: { id: incidentId, companyId },
    include: {
      car: { select: { brand: true, model: true, registrationNumber: true } },
      user: { select: { name: true, email: true } },
      attachments: true,
    },
  });
  if (!incident) return { ok: false, error: "not_found" };

  const admins = await tenant.companyMember.findMany({
    where: { companyId, role: "ADMIN", status: "ENROLLED" },
    include: { user: { select: { email: true } } },
  });
  const to = admins.map((a) => a.user?.email).filter(Boolean);
  if (!to.length) return { ok: false, error: "no_admins" };

  const carLabel =
    [incident.car?.brand, incident.car?.model, incident.car?.registrationNumber].filter(Boolean).join(" ") || "—";
  const driverLabel = incident.user?.name
    ? `${incident.user.name}${incident.user.email ? ` (${incident.user.email})` : ""}`
    : incident.user?.email || "—";
  const occurred = formatOccurred(incident.occurredAt);

  const attachments = (incident.attachments || []).map((a) => ({
    id: a.id,
    filename: a.filename,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    url: incidentAttachmentUrlForApi(a.blobUrl, a.id),
  }));

  const subject = `New incident report — ${company?.name || companyId}`;
  const text = [
    `New incident report — ${company?.name || companyId}`,
    "",
    `Title: ${incident.title || "—"}`,
    `Occurred: ${occurred}`,
    `Car: ${carLabel}`,
    `Driver: ${driverLabel}`,
    incident.location ? `Location: ${incident.location}` : null,
    incident.description ? `Description:\n${incident.description}` : null,
    "",
    `Attachments: ${attachments.length}`,
    ...attachments.map((a) => `- ${a.filename} (${a.sizeBytes} bytes)`),
  ]
    .filter(Boolean)
    .join("\n");

  const listHtml = attachments.length
    ? `<ul style="margin:8px 0 0;padding-left:18px;">${attachments
        .map(
          (a) =>
            `<li style="margin:0 0 8px;"><a href="${escapeEmailText(a.url)}" style="color:#0369a1;text-decoration:none;font-weight:700;">${escapeEmailText(
              a.filename
            )}</a> <span style="color:#64748b;font-size:12px;">(${escapeEmailText(String(a.contentType || ""))}, ${escapeEmailText(
              String(a.sizeBytes)
            )} bytes)</span></li>`
        )
        .join("")}</ul>`
    : `<p style="margin:0;color:#64748b;font-size:14px;">No attachments.</p>`;

  const innerHtml = `
    <p style="margin:0 0 10px;font-size:18px;font-weight:800;color:#0f172a;">New incident report</p>
    <div style="margin:0 0 14px;padding:12px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;">
      <p style="margin:0 0 6px;"><strong style="color:#0f172a;">Company:</strong> ${escapeEmailText(company?.name || companyId)}</p>
      <p style="margin:0 0 6px;"><strong style="color:#0f172a;">Title:</strong> ${escapeEmailText(incident.title || "—")}</p>
      <p style="margin:0 0 6px;"><strong style="color:#0f172a;">Occurred:</strong> ${escapeEmailText(occurred)}</p>
      <p style="margin:0 0 6px;"><strong style="color:#0f172a;">Car:</strong> ${escapeEmailText(carLabel)}</p>
      <p style="margin:0;"><strong style="color:#0f172a;">Driver:</strong> ${escapeEmailText(driverLabel)}</p>
    </div>
    ${
      incident.location
        ? `<p style="margin:0 0 8px;"><strong style="color:#0f172a;">Location:</strong> ${escapeEmailText(incident.location)}</p>`
        : ""
    }
    ${
      incident.description
        ? `<p style="margin:0 0 12px;"><strong style="color:#0f172a;">Description:</strong><br />${escapeEmailText(incident.description).replace(/\n/g, "<br />")}</p>`
        : ""
    }
    <p style="margin:0 0 8px;"><strong style="color:#0f172a;">Attachments</strong></p>
    ${listHtml}
  `.trim();

  const html = wrapBrandedEmailHtml({
    innerHtml,
    preheader: `New incident: ${incident.title || "Incident"} — ${carLabel}`,
  });

  // Attach files as real email attachments (optional).
  const wantAttach = String(process.env.INCIDENT_EMAIL_ATTACHMENTS || "").toLowerCase() === "true";
  const maxTotal = Math.max(0, parseInt(process.env.INCIDENT_EMAIL_ATTACHMENTS_MAX_BYTES || "7000000", 10) || 7000000);
  const maxFiles = Math.max(0, parseInt(process.env.INCIDENT_EMAIL_ATTACHMENTS_MAX_FILES || "5", 10) || 5);
  const attachmentsForEmail = [];
  if (wantAttach && maxTotal > 0 && maxFiles > 0) {
    let total = 0;
    for (const a of (incident.attachments || [])) {
      if (attachmentsForEmail.length >= maxFiles) break;
      if (a?.sizeBytes != null && total + Number(a.sizeBytes) > maxTotal) break;
      const buf = await bufferFromStoredIncidentBlob(a.blobUrl).catch(() => null);
      if (!buf || !buf.length) continue;
      total += buf.length;
      attachmentsForEmail.push({
        filename: a.filename || `attachment-${a.id}`,
        content: buf.toString("base64"),
        content_type: a.contentType || "application/octet-stream",
      });
    }
  }

  const res = await sendEmail({ to, subject, html, text, attachments: attachmentsForEmail });
  if (!res?.ok && res?.error !== "not_configured") {
    console.warn("[incidents-email] sendIncidentAdminEmail failed", {
      companyId,
      incidentId,
      error: res?.error,
    });
  }
  return res;
}

