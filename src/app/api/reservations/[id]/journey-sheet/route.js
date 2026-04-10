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

  // For instant reservations the stored endDate may be far in the future (legacy 1-year placeholder).
  // Cap the displayed planned end to startDate + 1 hour whenever the gap exceeds 2 days.
  const startMs = new Date(reservation.startDate).getTime();
  const endMs = new Date(reservation.endDate).getTime();
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const displayEndDate =
    endMs - startMs > TWO_DAYS_MS
      ? new Date(startMs + ONE_HOUR_MS)
      : reservation.endDate;

  const driverName = reservation.user?.name || "—";
  const startDateStr = new Date(reservation.startDate)
    .toLocaleDateString("ro-RO", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" })
    .replace(/\//g, ".");
  const safeDriver = driverName.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  const safeDate = startDateStr.replace(/[^\d.]/g, "");

  const pdf = buildJourneySheetPdf({
    companyName: company?.name || "—",
    driverName,
    driverEmail: reservation.user?.email || "—",
    vehicleLabel,
    registrationNumber: reservation.car?.registrationNumber || "—",
    purpose: reservation.purpose || "",
    startDate: reservation.startDate,
    endDate: displayEndDate,
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

  const filename = `journey-sheet-${safeDriver}-${safeDate}.pdf`;
  return new Response(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
