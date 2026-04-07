/**
 * PATCH /api/reservations/[id] – cancel, release, or extend reservation
 * Body: { action: "cancel" } | { action: "release", newKm: number, exceededReason?: string } | { action: "extend", endDate: "ISO string" }
 */

import { z } from "zod";
import { getReservationById, cancelReservation, extendReservation, completeReservation, updateExceededApprovalStatus, refreshReservationCodes } from "@/lib/reservations";
import { updateCar } from "@/lib/cars";
import { getCompanyById } from "@/lib/companies";
import { getProvider, LAYERS, PROVIDERS } from "@/lib/data-source-manager";
import { prisma } from "@/lib/db";
import { requireCompany, jsonResponse, errorResponse, dataSourceNotConfiguredResponse } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getUserById } from "@/lib/users";
import {
  shouldSendBookingEmail,
  sendReservationCancelledEmail,
  sendReservationExtendedEmail,
  sendKmExceededDecisionEmail,
} from "@/lib/email";

async function tryBookingEmailToUser(userId, send) {
  const u = await getUserById(userId);
  if (!shouldSendBookingEmail(u)) return;
  try {
    await send(u);
  } catch (e) {
    console.error("[reservations] booking notification email:", e);
  }
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({
    action: z.literal("release"),
    newKm: z.number().int().min(0),
    exceededReason: z.string().max(2000).optional(),
  }),
  z.object({ action: z.literal("extend"), endDate: z.string().datetime() }),
  z.object({ action: z.literal("approveExceeded"), observations: z.string().max(2000).optional() }),
  z.object({ action: z.literal("rejectExceeded"), observations: z.string().max(2000).optional() }),
  z.object({ action: z.literal("refreshCodes") }),
]);

export async function GET(_request, { params }) {
  const out = await requireCompany();
  if ("response" in out) return out.response;

  const { id } = await params;
  const reservation = await getReservationById(id);
  if (!reservation) return errorResponse("Reservation not found", 404);

  const isAdmin = out.session.role === "ADMIN";
  const isOwner = reservation.userId === out.session.userId;
  const sameCompany = reservation.car?.companyId === out.session.companyId;
  if (!sameCompany || (!isOwner && !isAdmin)) return errorResponse("Forbidden", 403);

  const showCodes = isOwner || isAdmin;
  return jsonResponse({
    id: reservation.id,
    carId: reservation.carId,
    car: reservation.car,
    userId: reservation.userId,
    user: reservation.user,
    startDate: reservation.startDate,
    endDate: reservation.endDate,
    purpose: reservation.purpose,
    status: reservation.status,
    pickup_code: showCodes ? reservation.pickup_code : undefined,
    code_valid_from: showCodes ? reservation.code_valid_from : undefined,
    release_code: showCodes ? reservation.release_code : undefined,
    releasedKmUsed: reservation.releasedKmUsed,
    releasedExceededReason: reservation.releasedExceededReason,
    releasedExceededStatus: reservation.releasedExceededStatus,
    releasedExceededAdminComment: reservation.releasedExceededAdminComment,
    createdAt: reservation.createdAt,
    updatedAt: reservation.updatedAt,
  });
}

export async function PATCH(request, { params }) {
  const out = await requireCompany();
  if ("response" in out) return out.response;
  try {
    const provider = await getProvider(out.session.companyId, LAYERS.RESERVATIONS);
    if (provider !== PROVIDERS.LOCAL) return dataSourceNotConfiguredResponse(LAYERS.RESERVATIONS);
  } catch (err) {
    console.error("PATCH /api/reservations/[id] (data source) error:", err);
    return errorResponse(err?.message || "Failed to update reservation", 500);
  }
  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid or missing request body", 422);
  }

  // Handle refreshCodes with loose check so web and Android (Gson) both work
  if (body && typeof body === "object" && body.action === "refreshCodes") {
    const reservation = await getReservationById(id);
    if (!reservation) return errorResponse("Reservation not found", 404);
    const isOwn = reservation.userId === out.session.userId;
    const sameCompany = reservation.car?.companyId === out.session.companyId;
    const allowed = (out.session.role === "ADMIN" && sameCompany) || (isOwn && reservation.status === "ACTIVE");
    if (!allowed) return errorResponse("Forbidden", 403);
    if (reservation.status !== "ACTIVE") return errorResponse("Only active reservations can have codes refreshed", 422);
    const updated = await refreshReservationCodes(id);
    return jsonResponse({ ok: true, pickup_code: updated.pickup_code, release_code: updated.release_code });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return errorResponse("Invalid input", 422);

  const reservation = await getReservationById(id);
  if (!reservation) return errorResponse("Reservation not found", 404);

  const isOwn = reservation.userId === out.session.userId;
  const isAdmin = out.session.role === "ADMIN";
  const sameCompany = reservation.car?.companyId === out.session.companyId;
  if (!sameCompany || (!isOwn && !isAdmin)) return errorResponse("Forbidden", 403);

  if (parsed.data.action === "cancel") {
    await cancelReservation(id);
    if (reservation.status === "ACTIVE") {
      await updateCar(reservation.carId, reservation.car.companyId, { status: "AVAILABLE" });
    }
    await writeAuditLog({
      companyId: reservation.car.companyId,
      actorId: out.session.userId,
      action: "RESERVATION_CANCELLED",
      entityType: "RESERVATION",
      entityId: id,
      meta: {
        carId: reservation.carId,
        carLabel: `${reservation.car.brand ?? ""} ${reservation.car.model ?? ""}`.trim(),
        userId: reservation.userId,
        startDate: reservation.startDate,
        endDate: reservation.endDate,
        cancelledByAdmin: out.session.role === "ADMIN" && reservation.userId !== out.session.userId,
      },
    });
    await tryBookingEmailToUser(reservation.userId, (u) =>
      sendReservationCancelledEmail({
        to: u.email,
        name: u.name,
        reservation,
      })
    );
    return jsonResponse({ ok: true, status: "CANCELLED" });
  }

  if (parsed.data.action === "release") {
    if (reservation.status !== "ACTIVE") return errorResponse("Only active reservations can be released", 422);
    const fresh = await prisma.car.findFirst({
      where: { id: reservation.carId, companyId: reservation.car.companyId },
      select: { km: true },
    });
    const currentKm = fresh?.km ?? reservation.car.km ?? 0;
    const newKm = parsed.data.newKm;
    if (newKm < currentKm) {
      return errorResponse(
        `Odometer must be greater than or equal to the last known reading (${currentKm} km). Lower values are not allowed.`,
        422
      );
    }
    const kmUsed = newKm - currentKm;
    const company = await getCompanyById(reservation.car.companyId);
    const defaultKm = company?.defaultKmUsage ?? 100;
    const exceededReason = (parsed.data.exceededReason ?? "").trim();
    if (kmUsed > defaultKm && !exceededReason) {
      return errorResponse("Reason is required when km used exceeds company limit (" + defaultKm + " km)", 422);
    }
    await completeReservation(id, {
      releasedKmUsed: kmUsed,
      ...(exceededReason && {
        releasedExceededReason: exceededReason,
        releasedExceededStatus: "PENDING_APPROVAL",
      }),
    });
    await updateCar(reservation.carId, reservation.car.companyId, { status: "AVAILABLE", km: newKm });
    await writeAuditLog({
      companyId: reservation.car.companyId,
      actorId: out.session.userId,
      action: "RESERVATION_COMPLETED",
      entityType: "RESERVATION",
      entityId: id,
      meta: {
        carId: reservation.carId,
        carLabel: `${reservation.car.brand ?? ""} ${reservation.car.model ?? ""}`.trim(),
        userId: reservation.userId,
        kmBefore: currentKm,
        kmAfter: newKm,
        kmUsed,
        ...(exceededReason && { exceededReason }),
      },
    });
    return jsonResponse({ ok: true, status: "COMPLETED", km: newKm, kmUsed });
  }

  if (parsed.data.action === "approveExceeded" || parsed.data.action === "rejectExceeded") {
    if (out.session.role !== "ADMIN" || reservation.car.companyId !== out.session.companyId) return errorResponse("Forbidden", 403);
    if (reservation.status !== "COMPLETED" || reservation.releasedExceededStatus !== "PENDING_APPROVAL") {
      return errorResponse("Reservation has no pending km-exceeded approval", 422);
    }
    const status = parsed.data.action === "approveExceeded" ? "APPROVED" : "REJECTED";
    const observations = parsed.data.observations?.trim() || undefined;
    const updated = await updateExceededApprovalStatus(id, status, observations);
    await writeAuditLog({
      companyId: reservation.car.companyId,
      actorId: out.session.userId,
      action: status === "APPROVED" ? "KM_EXCEEDED_APPROVED" : "KM_EXCEEDED_REJECTED",
      entityType: "RESERVATION",
      entityId: id,
      meta: {
        carId: reservation.carId,
        carLabel: `${reservation.car.brand ?? ""} ${reservation.car.model ?? ""}`.trim(),
        userId: reservation.userId,
        releasedKmUsed: reservation.releasedKmUsed,
        observations: observations ?? null,
      },
    });
    const forEmail = await getReservationById(id);
    await tryBookingEmailToUser(reservation.userId, (u) =>
      sendKmExceededDecisionEmail({
        to: u.email,
        name: u.name,
        reservation: forEmail || { ...reservation, ...updated },
        decision: status,
      })
    );
    return jsonResponse({ ok: true, releasedExceededStatus: updated.releasedExceededStatus });
  }

  const newEnd = new Date(parsed.data.endDate);
  try {
    const updated = await extendReservation(id, newEnd);
    await writeAuditLog({
      companyId: reservation.car.companyId,
      actorId: out.session.userId,
      action: "RESERVATION_EXTENDED",
      entityType: "RESERVATION",
      entityId: id,
      meta: {
        carId: reservation.carId,
        carLabel: `${reservation.car.brand ?? ""} ${reservation.car.model ?? ""}`.trim(),
        userId: reservation.userId,
        oldEndDate: reservation.endDate,
        newEndDate: newEnd,
      },
    });
    const full = await getReservationById(id);
    await tryBookingEmailToUser(reservation.userId, (u) =>
      sendReservationExtendedEmail({
        to: u.email,
        name: u.name,
        reservation: full || updated,
      })
    );
    return jsonResponse({
      id: updated.id,
      endDate: updated.endDate,
      status: updated.status,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to extend";
    return errorResponse(message, 409);
  }
}
