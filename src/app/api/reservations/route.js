/**
 * GET /api/reservations – list reservations (user: own; admin: company-wide unless mine=1)
 * POST /api/reservations – create reservation
 */

import { z } from "zod";
import { listReservations, createReservation, createInstantReservation, ensureReservationHasCodes } from "@/lib/reservations";
import { updateCar } from "@/lib/cars";
import { getProvider, getLayerTable, getStoredCredentials, LAYERS, PROVIDERS } from "@/lib/data-source-manager";
import { listSqlServerReservations } from "@/lib/connectors/sql-server-reservations";
import { requireCompany, jsonResponse, errorResponse, dataSourceNotConfiguredResponse } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { sendReservationConfirmationEmail, shouldSendBookingEmail } from "@/lib/email";

// Identity verification (face selfie) is treated as a secondary signal.
// Driving licence approval remains mandatory to reserve a car.

const postSchema = z.object({
  carId: z.string().min(1),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  purpose: z.string().max(500).optional().nullable(),
});

export async function GET(request) {
  const out = await requireCompany();
  if ("response" in out) return out.response;
  let provider;
  try {
    provider = await getProvider(out.session.companyId, LAYERS.RESERVATIONS);
  } catch (err) {
    console.error("GET /api/reservations (data source) error:", err);
    return errorResponse(err?.message || "Failed to load reservations", 500);
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;
  const carId = searchParams.get("carId") ?? undefined;
  const mineOnly =
    searchParams.get("mine") === "1" ||
    (searchParams.get("mine") || "").toLowerCase() === "true";
  const isAdmin = out.session.role === "ADMIN";

  if (provider === PROVIDERS.SQL_SERVER) {
    const tableName = await getLayerTable(out.session.companyId, LAYERS.RESERVATIONS);
    if (!tableName) {
      return dataSourceNotConfiguredResponse(LAYERS.RESERVATIONS, "Select a data table in Database Settings for the Reservations layer.");
    }
    const creds = await getStoredCredentials(out.session.companyId, LAYERS.RESERVATIONS, PROVIDERS.SQL_SERVER);
    if (!creds?.host || !creds?.username || !creds?.password) {
      return dataSourceNotConfiguredResponse(LAYERS.RESERVATIONS, "SQL Server credentials not saved. Connect again in Database Settings.");
    }
    try {
      const options = { status, carId };
      if (!isAdmin || mineOnly) options.userId = out.session.userId;
      const list = await listSqlServerReservations(out.session.companyId, options);
      if (list == null) {
        return dataSourceNotConfiguredResponse(LAYERS.RESERVATIONS, "Could not load reservations from SQL Server. Check table and credentials.");
      }
      return jsonResponse(
        list.map((r) => {
          const isOwner = r.userId === out.session.userId;
          const showCodes = isOwner || isAdmin;
          return {
            id: r.id,
            carId: r.carId,
            car: r.car,
            userId: r.userId,
            user: r.user,
            startDate: r.startDate,
            endDate: r.endDate,
            purpose: r.purpose,
            status: r.status,
            pickup_code: showCodes ? r.pickup_code : undefined,
            code_valid_from: showCodes ? r.code_valid_from : undefined,
            release_code: showCodes ? r.release_code : undefined,
            releasedKmUsed: r.releasedKmUsed,
            releasedExceededReason: r.releasedExceededReason,
            releasedExceededStatus: r.releasedExceededStatus,
            releasedExceededAdminComment: r.releasedExceededAdminComment,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          };
        })
      );
    } catch (err) {
      console.error("GET /api/reservations (SQL Server) error:", err);
      const msg = err?.message || String(err) || "Failed to load reservations from SQL Server";
      return dataSourceNotConfiguredResponse(LAYERS.RESERVATIONS, msg);
    }
  }

  if (provider !== PROVIDERS.LOCAL) {
    return dataSourceNotConfiguredResponse(LAYERS.RESERVATIONS);
  }

  const options = {
    companyId: out.session.companyId,
    status,
    carId,
  };
  if (!isAdmin || mineOnly) options.userId = out.session.userId;
  const list = await listReservations(options);
  const withCodes = await Promise.all(list.map(ensureReservationHasCodes));
  return jsonResponse(
    withCodes.map((r) => {
      const isOwner = r.userId === out.session.userId;
      const showCodes = isOwner || isAdmin;
      return {
        id: r.id,
        carId: r.carId,
        car: r.car,
        userId: r.userId,
        user: r.user,
        startDate: r.startDate,
        endDate: r.endDate,
        purpose: r.purpose,
        status: r.status,
        pickup_code: showCodes ? r.pickup_code : undefined,
        code_valid_from: showCodes ? r.code_valid_from : undefined,
        release_code: showCodes ? r.release_code : undefined,
        releasedKmUsed: r.releasedKmUsed,
        releasedExceededReason: r.releasedExceededReason,
        releasedExceededStatus: r.releasedExceededStatus,
        releasedExceededAdminComment: r.releasedExceededAdminComment,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    })
  );
}

export async function POST(request) {
  const out = await requireCompany();
  if ("response" in out) return out.response;
  try {
    const provider = await getProvider(out.session.companyId, LAYERS.RESERVATIONS);
    if (provider !== PROVIDERS.LOCAL) return dataSourceNotConfiguredResponse(LAYERS.RESERVATIONS);
  } catch (err) {
    console.error("POST /api/reservations (data source) error:", err);
    return errorResponse(err?.message || "Failed to create reservation", 500);
  }
  const { getUserById } = await import("@/lib/users");
  const currentUser = await getUserById(out.session.userId);
  if (currentUser?.drivingLicenceStatus !== "APPROVED") {
    return errorResponse("You must have an approved driving licence to reserve a car. Upload your driving licence and wait for admin approval.", 403);
  }
  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("Invalid input", 422);
  const { carId, startDate, endDate, purpose } = parsed.data;
  const isInstant = startDate == null && endDate == null;
  try {
    let reservation;
    if (isInstant) {
      reservation = await createInstantReservation(out.session.userId, carId, purpose, out.session.companyId);
      await updateCar(carId, reservation.car.companyId, { status: "RESERVED" });
    } else {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (end <= start) return errorResponse("End must be after start", 422);
      reservation = await createReservation(out.session.userId, carId, start, end, purpose, out.session.companyId);
      // Future time-window bookings must not flip the car to RESERVED immediately; the car stays
      // AVAILABLE until the slot starts so others can book non-overlapping periods (e.g. 12–14
      // while another user has 14–15). Instant bookings still set RESERVED above.
      const now = Date.now();
      if (start.getTime() <= now) {
        await updateCar(carId, reservation.car.companyId, { status: "RESERVED" });
      }
    }
    await writeAuditLog({
      companyId: out.session.companyId,
      actorId: out.session.userId,
      action: "RESERVATION_CREATED",
      entityType: "RESERVATION",
      entityId: reservation.id,
      meta: {
        carId: reservation.carId,
        carLabel: `${reservation.car?.brand ?? ""} ${reservation.car?.model ?? ""}`.trim(),
        startDate: reservation.startDate,
        endDate: reservation.endDate,
        purpose: reservation.purpose ?? null,
        instant: isInstant,
      },
    });
    if (shouldSendBookingEmail(currentUser)) {
      try {
        const sent = await sendReservationConfirmationEmail({
          to: currentUser.email,
          name: currentUser.name,
          reservation,
        });
        if (!sent.ok) {
          console.error("[reservations] confirmation email failed:", sent.error);
        }
      } catch (e) {
        console.error("[reservations] confirmation email exception:", e);
      }
    }
    return jsonResponse(
      {
        id: reservation.id,
        car: reservation.car,
        user: reservation.user,
        startDate: reservation.startDate,
        endDate: reservation.endDate,
        purpose: reservation.purpose,
        status: reservation.status,
        pickup_code: reservation.pickup_code,
        code_valid_from: reservation.code_valid_from,
        release_code: reservation.release_code,
      },
      201
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create reservation";
    return errorResponse(message, 409);
  }
}
