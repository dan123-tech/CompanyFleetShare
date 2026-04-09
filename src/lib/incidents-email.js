import { getTenantPrisma } from "@/lib/tenant-db";
import { sendEmail } from "@/lib/email";

export async function sendIncidentAdminEmail(companyId, { incidentId, carLabel, title }) {
  const tenant = await getTenantPrisma(companyId);
  const company = await tenant.company.findUnique({ where: { id: companyId }, select: { name: true } });
  const admins = await tenant.companyMember.findMany({
    where: { companyId, role: "ADMIN", status: "ENROLLED" },
    include: { user: { select: { email: true } } },
  });
  const to = admins.map((a) => a.user?.email).filter(Boolean);
  if (!to.length) return { ok: false, error: "no_admins" };

  const subject = `New incident report — ${company?.name || companyId}`;
  const text = [
    `A driver submitted an incident report.`,
    "",
    `Car: ${carLabel || "—"}`,
    `Title: ${title || "—"}`,
    `Incident ID: ${incidentId}`,
  ].join("\n");

  const html = `
    <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#0f172a;">New incident report</p>
    <p style="margin:0 0 6px;color:#334155;"><strong>Car:</strong> ${String(carLabel || "—")}</p>
    <p style="margin:0 0 6px;color:#334155;"><strong>Title:</strong> ${String(title || "—")}</p>
    <p style="margin:0;color:#64748b;font-size:13px;">Incident ID: ${String(incidentId)}</p>
  `.trim();

  return sendEmail({ to, subject, html, text });
}

