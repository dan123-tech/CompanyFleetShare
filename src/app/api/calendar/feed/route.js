/**
 * GET /api/calendar/feed?token=… — subscribed calendar (ICS) for a user's reservations.
 * No session cookie; token is the user's secret calendarFeedToken.
 */

import { prisma } from "@/lib/db";
import { findUserByCalendarFeedToken } from "@/lib/users";
import { buildReservationFeedIcs } from "@/lib/ics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  const user = await findUserByCalendarFeedToken(token || "");
  if (!user) {
    return new Response("Forbidden", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const rows = await prisma.reservation.findMany({
    where: {
      userId: user.id,
      NOT: { status: "CANCELLED" },
      OR: [{ status: "ACTIVE" }, { endDate: { gte: since } }],
    },
    include: { car: { select: { brand: true, model: true, registrationNumber: true } } },
    orderBy: { startDate: "asc" },
  });

  const events = rows.map((r) => {
    const carLabel = [r.car?.brand, r.car?.model, r.car?.registrationNumber].filter(Boolean).join(" ").trim() || "Vehicle";
    const purpose = r.purpose?.trim();
    return {
      uid: `fleetshare-res-${r.id}`,
      startDate: r.startDate,
      endDate: r.endDate,
      summary: `FleetShare — ${carLabel}`,
      description: [purpose && `Purpose: ${purpose}`, `Status: ${r.status}`].filter(Boolean).join("\n"),
    };
  });

  const ics = buildReservationFeedIcs(events);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
    },
  });
}
