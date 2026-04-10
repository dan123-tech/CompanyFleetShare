/**
 * POST /api/reservations/verify-pickup-code
 * Body: { pickup_code: string, bypass?: boolean }
 * Validates pickup code against 30-minute window. Admin can pass bypass: true to skip time check.
 */

import { z } from "zod";
import { getActiveReservationByPickupCode, verifyPickupCodeTimeWindow } from "@/lib/reservations";
import { requireCompany, jsonResponse, errorResponse, requireTrustedOriginForMutation } from "@/lib/api-helpers";
import { isCompanyAdmin } from "@/lib/companies";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  pickup_code: z.string().min(1).max(20),
  bypass: z.boolean().optional(),
});

export async function POST(request) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  const out = await requireCompany();
  if ("response" in out) return out.response;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("Invalid input", 422);
  const { pickup_code, bypass } = parsed.data;

  const reservation = await getActiveReservationByPickupCode(pickup_code, out.session.companyId);
  if (!reservation) {
    return errorResponse("Invalid or expired code.", 404);
  }

  const allowBypass = bypass && out.session.role === "ADMIN" && (await isCompanyAdmin(out.session.userId, out.session.companyId));
  const result = verifyPickupCodeTimeWindow(reservation, new Date(), { bypass: !!allowBypass });

  if (!result.valid) {
    return errorResponse(result.error, 400);
  }

  // Record the actual pickup time (best-effort, only if not already set).
  try {
    if (!result.reservation.pickedUpAt) {
      await prisma.reservation.update({
        where: { id: result.reservation.id },
        data: { pickedUpAt: new Date() },
      });
    }
  } catch (e) {
    console.warn("[verify-pickup] could not set pickedUpAt:", e?.message);
  }

  return jsonResponse({
    valid: true,
    reservation: {
      id: result.reservation.id,
      car: result.reservation.car,
      user: result.reservation.user,
      startDate: result.reservation.startDate,
      endDate: result.reservation.endDate,
    },
  });
}
