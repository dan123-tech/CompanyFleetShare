/**
 * Reservation domain logic: create, list, cancel, extend.
 * Overlap validation: same car cannot double-book; same user cannot overlap across cars.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getTenantPrisma } from "@/lib/tenant-db";

const SERIALIZABLE_TX = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5000,
  timeout: 15000,
};

/** Generate a random 6-digit code (string, e.g. "042817"). */
function generateSixDigitCode() {
  const n = Math.floor(Math.random() * 1_000_000);
  return String(n).padStart(6, "0");
}

/**
 * Check if a car has any overlapping ACTIVE reservation in the given range.
 * @param {string} carId
 * @param {Date} start
 * @param {Date} end
 * @param {string} [excludeReservationId] - Optional id to exclude (for extend/update)
 * @returns {Promise<boolean>}
 */
export async function hasOverlappingReservation(carId, start, end, excludeReservationId) {
  const count = await prisma.reservation.count({
    where: {
      carId,
      status: "ACTIVE",
      id: excludeReservationId ? { not: excludeReservationId } : undefined,
      OR: [{ startDate: { lt: end }, endDate: { gt: start } }],
    },
  });
  return count > 0;
}

async function hasOverlappingReservationTx(tx, carId, start, end, excludeReservationId) {
  const count = await tx.reservation.count({
    where: {
      carId,
      status: "ACTIVE",
      id: excludeReservationId ? { not: excludeReservationId } : undefined,
      OR: [{ startDate: { lt: end }, endDate: { gt: start } }],
    },
  });
  return count > 0;
}

/**
 * True if this user already has an ACTIVE reservation (any car) overlapping [start, end).
 * Prevents e.g. 13:55–14:00 on car Y and 13:57–14:50 on car X for the same user.
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {string} userId
 * @param {Date} start
 * @param {Date} end
 * @param {string} [excludeReservationId]
 */
async function hasOverlappingUserReservationTx(tx, userId, start, end, excludeReservationId) {
  const count = await tx.reservation.count({
    where: {
      userId,
      status: "ACTIVE",
      id: excludeReservationId ? { not: excludeReservationId } : undefined,
      startDate: { lt: end },
      endDate: { gt: start },
    },
  });
  return count > 0;
}

/**
 * Earliest start of an ACTIVE reservation on this car that begins strictly after `after`.
 * Used to cap instant bookings so the car stays bookable until the next scheduled window.
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {string} carId
 * @param {Date} after
 * @returns {Promise<Date|null>}
 */
async function getNextActiveReservationStartAfter(tx, carId, after) {
  const row = await tx.reservation.findFirst({
    where: {
      carId,
      status: "ACTIVE",
      startDate: { gt: after },
    },
    orderBy: { startDate: "asc" },
    select: { startDate: true },
  });
  return row?.startDate ?? null;
}

/**
 * Create a reservation. Fails if car has overlapping ACTIVE reservation.
 * @param {string} userId
 * @param {string} carId
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {string|null} [purpose]
 * @returns {Promise<Object>} Created reservation
 */
export async function createReservation(userId, carId, startDate, endDate, purpose, companyId) {
  if (startDate.getTime() < Date.now()) {
    throw new Error("Start time must be now or in the future");
  }
  const resolvedCompanyId =
    companyId || (await prisma.car.findUnique({ where: { id: carId }, select: { companyId: true } }))?.companyId;
  const tenant = await getTenantPrisma(resolvedCompanyId);
  const pickup_code = generateSixDigitCode();
  const code_valid_from = startDate;

  return tenant.$transaction(
    async (tx) => {
      const overlap = await hasOverlappingReservationTx(tx, carId, startDate, endDate);
      if (overlap) {
        throw new Error("Car is already reserved for this period");
      }
      const userOverlap = await hasOverlappingUserReservationTx(tx, userId, startDate, endDate);
      if (userOverlap) {
        throw new Error(
          "You already have another reservation that overlaps this time on a different car. Cancel or finish it first, or choose a time that does not overlap."
        );
      }
      return tx.reservation.create({
        data: {
          userId,
          carId,
          startDate,
          endDate,
          purpose: purpose?.trim() || null,
          status: "ACTIVE",
          pickup_code,
          code_valid_from,
          release_code: null,
        },
        include: { car: true, user: { select: { id: true, name: true, email: true } } },
      });
    },
    SERIALIZABLE_TX
  );
}

/** 1 hour in ms – default duration for instant reservations (can be extended when releasing) */
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Create an instant reservation (now until released). Car must have no ACTIVE reservation.
 * @param {string} userId
 * @param {string} carId
 * @param {string|null} [purpose]
 * @returns {Promise<Object>} Created reservation with car and user
 */
export async function createInstantReservation(userId, carId, purpose, companyId) {
  const resolvedCompanyId =
    companyId || (await prisma.car.findUnique({ where: { id: carId }, select: { companyId: true } }))?.companyId;
  const tenant = await getTenantPrisma(resolvedCompanyId);
  const now = new Date();
  const pickup_code = generateSixDigitCode();
  const code_valid_from = now;

  return tenant.$transaction(
    async (tx) => {
      const nextScheduledStart = await getNextActiveReservationStartAfter(tx, carId, now);
      const defaultEnd = new Date(now.getTime() + ONE_HOUR_MS);
      const endUntilRelease =
        nextScheduledStart != null && nextScheduledStart.getTime() > now.getTime() && nextScheduledStart < defaultEnd
          ? nextScheduledStart
          : defaultEnd;

      if (endUntilRelease.getTime() <= now.getTime()) {
        throw new Error("Car is not available for an instant booking right now (next reservation starts immediately).");
      }

      const overlap = await hasOverlappingReservationTx(tx, carId, now, endUntilRelease);
      if (overlap) {
        throw new Error("Car is already reserved");
      }
      const userOverlap = await hasOverlappingUserReservationTx(tx, userId, now, endUntilRelease);
      if (userOverlap) {
        throw new Error(
          "You already have another reservation that overlaps this time on a different car. Cancel or finish it first, or choose a time that does not overlap."
        );
      }
      return tx.reservation.create({
        data: {
          userId,
          carId,
          startDate: now,
          endDate: endUntilRelease,
          purpose: purpose?.trim() || null,
          status: "ACTIVE",
          pickup_code,
          code_valid_from,
          release_code: null,
          pickedUpAt: now, // instant reservation — pickup time = now
        },
        include: { car: true, user: { select: { id: true, name: true, email: true } } },
      });
    },
    SERIALIZABLE_TX
  );
}

/**
 * List reservations: for a user (their own) or for a company (admin sees all).
 * @param {Object} options - { userId?, companyId?, carId?, status? }
 * @returns {Promise<Object[]>}
 */
export async function listReservations(options) {
  const tenant = await getTenantPrisma(options.companyId);
  const where = {};
  if (options.status) where.status = options.status;
  if (options.userId) where.userId = options.userId;
  if (options.carId) where.carId = options.carId;
  if (options.companyId) where.car = { companyId: options.companyId };

  return tenant.reservation.findMany({
    where,
    orderBy: { startDate: "desc" },
    include: {
      car: { select: { id: true, companyId: true, brand: true, model: true, registrationNumber: true, km: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

/**
 * If reservation is ACTIVE and missing pickup_code, generate and persist codes (backfill legacy).
 * @param {Object} r - reservation from listReservations
 * @returns {Promise<Object>} same or updated reservation with pickup_code/code_valid_from
 */
export async function ensureReservationHasCodes(r) {
  const tenant = await getTenantPrisma(r.car?.companyId);
  if (r.status !== "ACTIVE" || r.pickup_code) return r;
  const startDate = r.startDate ? new Date(r.startDate) : new Date();
  const pickup_code = generateSixDigitCode();
  // Code valid for 30 min from reservation start (same rule as create)
  const code_valid_from = startDate;
  await tenant.reservation.update({
    where: { id: r.id },
    data: { pickup_code, code_valid_from },
  });
  return { ...r, pickup_code, code_valid_from };
}

/**
 * Get a single reservation by id.
 * @param {string} reservationId
 * @returns {Promise<Object|null>}
 */
export async function getReservationById(reservationId) {
  return prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { car: true, user: true },
  });
}

/**
 * Find active reservation by pickup_code (for verification).
 * @param {string} pickupCode - 6-digit code
 * @param {string} [companyId] - optional filter by company
 * @returns {Promise<Object|null>}
 */
export async function getActiveReservationByPickupCode(pickupCode, companyId) {
  const where = { pickup_code: pickupCode?.trim() || "", status: "ACTIVE" };
  if (companyId) where.car = { companyId };
  return prisma.reservation.findFirst({
    where,
    include: { car: true, user: { select: { id: true, name: true, email: true } } },
  });
}

/**
 * Cancel a reservation (set status to CANCELLED).
 * @param {string} reservationId
 */
export async function cancelReservation(reservationId) {
  return prisma.reservation.update({
    where: { id: reservationId },
    data: { status: "CANCELLED" },
  });
}

/**
 * Release a reservation (set status to COMPLETED – car returned).
 * Generates and sets release_code when the user presses Release.
 * @param {string} reservationId
 * @param {{ releasedKmUsed?: number, releasedExceededReason?: string, releasedExceededStatus?: string }} [data]
 */
export async function completeReservation(reservationId, data = {}) {
  const release_code = generateSixDigitCode();
  const update = { status: "COMPLETED", release_code, releasedAt: new Date() };
  if (data.releasedKmUsed != null) update.releasedKmUsed = data.releasedKmUsed;
  if (data.releasedOdometerStart != null) update.releasedOdometerStart = data.releasedOdometerStart;
  if (data.releasedOdometerEnd != null) update.releasedOdometerEnd = data.releasedOdometerEnd;
  if (data.releasedExceededReason != null) update.releasedExceededReason = data.releasedExceededReason;
  if (data.releasedExceededStatus != null) update.releasedExceededStatus = data.releasedExceededStatus;
  return prisma.reservation.update({
    where: { id: reservationId },
    data: update,
  });
}

/**
 * Update exceeded reason approval status and optional admin comment (admin).
 * @param {string} reservationId
 * @param {"APPROVED"|"REJECTED"} status
 * @param {string} [adminComment]
 */
export async function updateExceededApprovalStatus(reservationId, status, adminComment) {
  const data = { releasedExceededStatus: status };
  if (adminComment != null) data.releasedExceededAdminComment = adminComment.trim() || null;
  return prisma.reservation.update({
    where: { id: reservationId },
    data,
    include: { car: true, user: { select: { id: true, name: true, email: true } } },
  });
}

/**
 * List COMPLETED reservations with PENDING_APPROVAL exceeded reason (for admin).
 * @param {string} companyId
 */
export async function listPendingExceededApprovals(companyId) {
  const tenant = await getTenantPrisma(companyId);
  return tenant.reservation.findMany({
    where: {
      status: "COMPLETED",
      releasedExceededStatus: "PENDING_APPROVAL",
      car: { companyId },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      car: { select: { id: true, brand: true, model: true, registrationNumber: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

/** 30 minutes in ms – pickup code is valid for 30 min after effective start. */
const PICKUP_WINDOW_MS = 30 * 60 * 1000;

/**
 * Get effective start for pickup window (code_valid_from ?? startDate).
 * @param {Object} reservation - must have code_valid_from and startDate
 * @returns {Date}
 */
export function getPickupWindowStart(reservation) {
  const from = reservation?.code_valid_from;
  const start = reservation?.startDate;
  if (from instanceof Date) return from;
  if (start instanceof Date) return start;
  if (from) return new Date(from);
  if (start) return new Date(start);
  return new Date(0);
}

/**
 * Verify pickup code time window for a reservation. Returns { valid: true } or { valid: false, error: string }.
 * Caller must have found reservation by pickup_code and status ACTIVE.
 * @param {Object} reservation - reservation with pickup_code, startDate, code_valid_from
 * @param {Date} [now] - current time (default now)
 * @param {{ bypass?: boolean }} [options] - bypass time check (admin only, checked by route)
 */
export function verifyPickupCodeTimeWindow(reservation, now = new Date(), options = {}) {
  if (!reservation || reservation.status !== "ACTIVE") {
    return { valid: false, error: "Invalid or expired code." };
  }
  if (options.bypass) return { valid: true, reservation };
  const effectiveStart = getPickupWindowStart(reservation);
  const windowEnd = new Date(effectiveStart.getTime() + PICKUP_WINDOW_MS);
  const startTime = effectiveStart.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  if (now < effectiveStart) {
    return { valid: false, error: `Code not active yet. Your reservation starts at ${startTime}.` };
  }
  if (now > windowEnd) {
    return { valid: false, error: "Code expired. You must contact admin as you are more than 30 minutes late for pick-up." };
  }
  return { valid: true, reservation };
}

/**
 * Refresh codes for a reservation (admin only).
 * Active: new pickup_code and code_valid_from = now (fresh 30-min window). Completed: pickup_code and release_code.
 * @param {string} reservationId
 * @returns {Promise<Object>} Updated reservation with car and user
 */
export async function refreshReservationCodes(reservationId) {
  const res = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { status: true },
  });
  if (!res) throw new Error("Reservation not found");
  const now = new Date();
  const pickup_code = generateSixDigitCode();
  const data = { pickup_code };
  if (res.status === "ACTIVE") {
    data.code_valid_from = now; // new 30-min pickup window from now
  }
  if (res.status === "COMPLETED") {
    let release_code = generateSixDigitCode();
    while (release_code === pickup_code) release_code = generateSixDigitCode();
    data.release_code = release_code;
  }
  return prisma.reservation.update({
    where: { id: reservationId },
    data,
    include: { car: true, user: { select: { id: true, name: true, email: true } } },
  });
}

/**
 * Extend a reservation end date. Validates no overlap with other ACTIVE reservations.
 * @param {string} reservationId
 * @param {Date} newEndDate
 * @returns {Promise<Object>}
 */
export async function extendReservation(reservationId, newEndDate) {
  return prisma.$transaction(
    async (tx) => {
      const res = await tx.reservation.findUnique({
        where: { id: reservationId },
        include: { car: true },
      });
      if (!res || res.status !== "ACTIVE") throw new Error("Reservation not found or not active");
      const overlap = await hasOverlappingReservationTx(
        tx,
        res.carId,
        res.startDate,
        newEndDate,
        reservationId
      );
      if (overlap) throw new Error("New end date overlaps with another reservation");
      const userOverlap = await hasOverlappingUserReservationTx(
        tx,
        res.userId,
        res.startDate,
        newEndDate,
        reservationId
      );
      if (userOverlap) {
        throw new Error(
          "Extending would overlap another of your reservations on a different car. Choose an earlier end time."
        );
      }
      return tx.reservation.update({
        where: { id: reservationId },
        data: { endDate: newEndDate },
        include: { car: true, user: { select: { id: true, name: true, email: true } } },
      });
    },
    SERIALIZABLE_TX
  );
}
