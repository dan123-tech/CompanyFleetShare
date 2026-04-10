/**
 * GET /api/reservations/[id]/journey-sheet — PDF journey log (RO), owner or admin, completed trips.
 */
import { getReservationById } from "@/lib/reservations";
import { getCompanyById } from "@/lib/companies";
import { getProvider, LAYERS, PROVIDERS } from "@/lib/data-source-manager";
import { requireCompany, errorResponse, dataSourceNotConfiguredResponse } from "@/lib/api-helpers";
import { buildJourneySheetPdf } from "@/lib/journey-sheet-pdf";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  const out = await requireCompany();
  if ("response" in out) return out.response;

  try {
    const provider = await getProvider(out.session.companyId, LAYERS.RESERVATIONS);
    if (provider !== PROVIDERS.LOCAL) return dataSourceNotConfiguredResponse(LAYERS.RESERVATIONS);
  } catch (err) {
    console.error("GET journey-sheet (data source) error:", err);
    return errorResponse(err?.message || "Failed to load reservation", 500);
  }

  const { searchParams } = new URL(request.url);
  const tz = searchParams.get("tz") || "Europe/Bucharest";
  const lang = searchParams.get("lang") === "ro" ? "ro" : "en";

  const { id } = await params;
  const reservation = await getReservationById(id);
  if (!reservation) return errorResponse("Reservation not found", 404);

  const sameCompany = reservation.car?.companyId === out.session.companyId;
  const isOwner = reservation.userId === out.session.userId;
  const isAdmin = out.session.role === "ADMIN";
  if (!sameCompany || (!isOwner && !isAdmin)) return errorResponse("Forbidden", 403);

  const st = String(reservation.status || "").toUpperCase();
  if (st !== "COMPLETED") {
    return errorResponse("Journey sheet is available only after the trip is completed (vehicle returned).", 422);
  }

  const company = await getCompanyById(out.session.companyId);
  const vehicleLabel = [reservation.car?.brand, reservation.car?.model].filter(Boolean).join(" ").trim() || "—";

  const pdf = buildJourneySheetPdf({
    companyName: company?.name || "—",
    driverName: reservation.user?.name || "—",
    driverEmail: reservation.user?.email || "—",
    vehicleLabel,
    registrationNumber: reservation.car?.registrationNumber || "—",
    purpose: reservation.purpose || "",
    startDate: reservation.startDate,
    endDate: reservation.endDate,
    pickedUpAt: reservation.pickedUpAt,
    releasedAt: reservation.releasedAt,
    releasedKmUsed: reservation.releasedKmUsed,
    releasedOdometerStart: reservation.releasedOdometerStart,
    releasedOdometerEnd: reservation.releasedOdometerEnd,
    generatedAt: new Date(),
    reservationId: reservation.id,
    tz,
    lang,
  });

  const safeId = String(reservation.id || "trip").replace(/[^\w-]+/g, "").slice(0, 24);
  return new Response(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="foaie-parcurs-${safeId}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
