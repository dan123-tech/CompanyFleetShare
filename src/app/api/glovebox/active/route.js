/**
 * GET /api/glovebox/active — documents for the current user's active reservation vehicle (digital glovebox).
 */
import { requireCompany, jsonResponse } from "@/lib/api-helpers";
import { getTenantPrisma } from "@/lib/tenant-db";
import { rcaDocumentUrlForClient } from "@/lib/glovebox-ref";

export async function GET() {
  const out = await requireCompany();
  if ("response" in out) return out.response;

  const tenant = await getTenantPrisma(out.session.companyId);
  const reservation = await tenant.reservation.findFirst({
    where: {
      userId: out.session.userId,
      status: "ACTIVE",
      car: { companyId: out.session.companyId },
    },
    orderBy: { startDate: "desc" },
    include: {
      car: {
        select: {
          id: true,
          brand: true,
          model: true,
          registrationNumber: true,
          itpExpiresAt: true,
          rcaExpiresAt: true,
          rcaDocumentUrl: true,
          rcaDocumentContentType: true,
          vignetteExpiresAt: true,
        },
      },
    },
  });

  if (!reservation?.car) {
    return jsonResponse({ active: false, car: null });
  }

  const c = reservation.car;
  return jsonResponse({
    active: true,
    reservationId: reservation.id,
    car: {
      id: c.id,
      label: [c.brand, c.model, c.registrationNumber].filter(Boolean).join(" "),
      registrationNumber: c.registrationNumber,
      itpExpiresAt: c.itpExpiresAt,
      rcaExpiresAt: c.rcaExpiresAt,
      rcaDocumentUrl: rcaDocumentUrlForClient(c.id, c.rcaDocumentUrl),
      rcaDocumentContentType: c.rcaDocumentContentType ?? null,
      vignetteExpiresAt: c.vignetteExpiresAt,
    },
    brokerRenewalUrl: process.env.NEXT_PUBLIC_INSURANCE_BROKER_URL?.trim() || null,
  });
}
