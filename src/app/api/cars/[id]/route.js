/**
 * GET /api/cars/[id] – one car (with reservation history for admin)
 * PATCH /api/cars/[id] – (admin) update car
 * DELETE /api/cars/[id] – (admin) delete car
 */

import { z } from "zod";
import { getCarById, updateCar, deleteCar } from "@/lib/cars";
import { getProvider, LAYERS, PROVIDERS } from "@/lib/data-source-manager";
import { getSqlServerCarById, updateSqlServerCar, deleteSqlServerCar } from "@/lib/connectors/sql-server-cars";
import {
  requireCompany,
  requireAdmin,
  jsonResponse,
  errorResponse,
  dataSourceNotConfiguredResponse,
  requireTrustedOriginForMutation,
} from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getTenantPrisma } from "@/lib/tenant-db";
import { rcaDocumentUrlForClient } from "@/lib/glovebox-ref";
import { sendItpExpiryAdminEmail, sendRcaExpiryAdminEmail } from "@/lib/email";

const FUEL_TYPES = ["Benzine", "Diesel", "Electric", "Hybrid"];
const VEHICLE_CATEGORIES = ["Sedan", "Suv", "Hatchback", "Wagon", "Coupe", "Van", "Truck", "Other"];
const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const patchSchema = z.object({
  brand: z.string().min(1).max(100).optional(),
  model: z.string().max(100).optional().nullable(),
  registrationNumber: z
    .string()
    .min(1)
    .max(50)
    .transform((s) => s.trim().toUpperCase())
    .optional(),
  vehicleCategory: z.enum(VEHICLE_CATEGORIES).optional(),
  km: z.number().int().min(0).optional(),
  status: z.enum(["AVAILABLE", "RESERVED", "IN_MAINTENANCE"]).optional(),
  fuelType: z.enum(FUEL_TYPES).optional(),
  averageConsumptionL100km: z.union([z.number().min(0).max(30), z.null()]).optional(),
  averageConsumptionKwh100km: z.union([z.number().min(0).max(100), z.null()]).optional(),
  batteryLevel: z.union([z.number().min(0).max(100).int(), z.null()]).optional(),
  batteryCapacityKwh: z.union([z.number().min(0).max(500), z.null()]).optional(),
  lastServiceMileage: z.union([z.number().int().min(0), z.null()]).optional(),
  lastServiceYearMonth: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v === null ? null : String(v).trim()),
    z.union([z.null(), z.string().regex(YEAR_MONTH)]).optional(),
  ),
  itpExpiresAt: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v === null ? null : String(v)),
    z.union([z.null(), z.string().datetime()]).optional(),
  ),
  rcaExpiresAt: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v === null ? null : String(v)),
    z.union([z.null(), z.string().datetime()]).optional(),
  ),
  vignetteExpiresAt: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v === null ? null : String(v)),
    z.union([z.null(), z.string().datetime()]).optional(),
  ),
  rcaDocumentUrl: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v === null ? null : String(v).trim()),
    z.union([z.null(), z.string().max(4000)]).optional(),
  ),
  rcaDocumentContentType: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v === null ? null : String(v).trim()),
    z.union([z.null(), z.string().max(120)]).optional(),
  ),
});

export async function GET(_request, { params }) {
  const out = await requireCompany();
  if ("response" in out) return out.response;
  const { id } = await params;
  try {
    const provider = await getProvider(out.session.companyId, LAYERS.CARS);
    if (provider === PROVIDERS.SQL_SERVER) {
      const car = await getSqlServerCarById(out.session.companyId, id);
      if (!car) return errorResponse("Car not found", 404);
      return jsonResponse({
        id: car.id,
        brand: car.brand,
        model: car.model,
        registrationNumber: car.registrationNumber,
        vehicleCategory: car.vehicleCategory ?? "Other",
        km: car.km,
        status: car.status,
        fuelType: car.fuelType ?? "Benzine",
        averageConsumptionL100km: car.averageConsumptionL100km ?? null,
        averageConsumptionKwh100km: car.averageConsumptionKwh100km ?? null,
        batteryLevel: car.batteryLevel ?? null,
        batteryCapacityKwh: car.batteryCapacityKwh ?? null,
        lastServiceMileage: car.lastServiceMileage ?? null,
      });
    }
    if (provider !== PROVIDERS.LOCAL) return dataSourceNotConfiguredResponse(LAYERS.CARS);
  } catch (err) {
    console.error("GET /api/cars/[id] error:", err);
    return errorResponse(err?.message || "Failed to load car", 500);
  }
  const car = await getCarById(id, out.session.companyId);
  if (!car) return errorResponse("Car not found", 404);
  const canSeeHistory = out.session.role === "ADMIN";
  return jsonResponse({
    id: car.id,
    brand: car.brand,
    model: car.model,
    registrationNumber: car.registrationNumber,
    km: car.km,
    status: car.status,
    fuelType: car.fuelType ?? "Benzine",
    averageConsumptionL100km: car.averageConsumptionL100km ?? null,
    averageConsumptionKwh100km: car.averageConsumptionKwh100km ?? null,
    batteryLevel: car.batteryLevel ?? null,
    batteryCapacityKwh: car.batteryCapacityKwh ?? null,
    lastServiceMileage: car.lastServiceMileage ?? null,
    lastServiceYearMonth: car.lastServiceYearMonth ?? null,
      itpExpiresAt: car.itpExpiresAt ?? null,
      rcaExpiresAt: car.rcaExpiresAt ?? null,
      rcaDocumentUrl: rcaDocumentUrlForClient(car.id, car.rcaDocumentUrl),
      rcaDocumentContentType: car.rcaDocumentContentType ?? null,
      vignetteExpiresAt: car.vignetteExpiresAt ?? null,
    ...(canSeeHistory && {
      reservations: car.reservations.map((r) => ({
        id: r.id,
        startDate: r.startDate,
        endDate: r.endDate,
        purpose: r.purpose,
        status: r.status,
        user: r.user,
      })),
    }),
  });
}

export async function PATCH(request, { params }) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  const out = await requireAdmin();
  if ("response" in out) return out.response;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("Invalid input", 422);
  const data = {
    ...parsed.data,
    ...(parsed.data.itpExpiresAt !== undefined && {
      itpExpiresAt: parsed.data.itpExpiresAt == null ? null : new Date(parsed.data.itpExpiresAt),
    }),
    ...(parsed.data.rcaExpiresAt !== undefined && {
      rcaExpiresAt: parsed.data.rcaExpiresAt == null ? null : new Date(parsed.data.rcaExpiresAt),
    }),
    ...(parsed.data.vignetteExpiresAt !== undefined && {
      vignetteExpiresAt: parsed.data.vignetteExpiresAt == null ? null : new Date(parsed.data.vignetteExpiresAt),
    }),
    ...(parsed.data.rcaDocumentUrl !== undefined && {
      rcaDocumentUrl: parsed.data.rcaDocumentUrl == null || parsed.data.rcaDocumentUrl === "" ? null : parsed.data.rcaDocumentUrl,
    }),
    ...(parsed.data.rcaDocumentContentType !== undefined && {
      rcaDocumentContentType:
        parsed.data.rcaDocumentContentType == null || parsed.data.rcaDocumentContentType === ""
          ? null
          : parsed.data.rcaDocumentContentType,
    }),
  };

  // Fetch current car state for before/after comparison
  let carBefore = null;
  try {
    carBefore = await getCarById(id, out.session.companyId);
  } catch (_) {}

  try {
    const provider = await getProvider(out.session.companyId, LAYERS.CARS);
    if (provider === PROVIDERS.SQL_SERVER) {
      const car = await updateSqlServerCar(out.session.companyId, id, data);
      if (!car) return errorResponse("Car not found", 404);
      const action = data.status && carBefore?.status !== data.status ? "CAR_STATUS_CHANGED" : "CAR_UPDATED";
      await writeAuditLog({
        companyId: out.session.companyId,
        actorId: out.session.userId,
        action,
        entityType: "CAR",
        entityId: id,
        meta: { before: carBefore ? { status: carBefore.status, km: carBefore.km } : null, after: data },
      });
      return jsonResponse(car);
    }
    if (provider !== PROVIDERS.LOCAL) return dataSourceNotConfiguredResponse(LAYERS.CARS);
  } catch (err) {
    console.error("PATCH /api/cars/[id] error:", err);
    return errorResponse(err?.message || "Failed to update car", 500);
  }

  // If admin is setting a new ITP date in the future and car is IN_MAINTENANCE, auto-restore to AVAILABLE.
  if (parsed.data.itpExpiresAt !== undefined && parsed.data.itpExpiresAt != null) {
    const newItp = new Date(parsed.data.itpExpiresAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isFuture = !Number.isNaN(newItp.getTime()) && newItp.getTime() > today.getTime();
    if (isFuture && carBefore?.status === "IN_MAINTENANCE" && data.status === undefined) {
      data.status = "AVAILABLE";
    }
  }

  const result = await updateCar(id, out.session.companyId, data);
  if (result.count === 0) return errorResponse("Car not found", 404);
  const car = await getCarById(id, out.session.companyId);

  // If ITP was updated and is due/expired, send email immediately (best-effort).
  try {
    if (parsed.data.itpExpiresAt !== undefined) {
      const exp = car?.itpExpiresAt ? new Date(car.itpExpiresAt) : null;
      if (exp && !Number.isNaN(exp.getTime())) {
        const reminderDays = Math.max(0, parseInt(process.env.ITP_REMINDER_DAYS || "30", 10) || 30);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const cutoff = new Date(today.getTime() + reminderDays * 24 * 60 * 60 * 1000);
        if (exp.getTime() <= cutoff.getTime()) {
          const tenant = await getTenantPrisma(out.session.companyId);
          const admins = await tenant.companyMember.findMany({
            where: { companyId: out.session.companyId, role: "ADMIN", status: "ENROLLED" },
            include: { user: { select: { email: true } } },
          });
          const to = admins.map((m) => m.user?.email).filter(Boolean);
          if (to.length) {
            const expDay = new Date(exp);
            expDay.setHours(0, 0, 0, 0);
            const daysUntil = Math.ceil((expDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
            const sendRes = await sendItpExpiryAdminEmail({
              to,
              companyName: out.company?.name || out.session.companyId,
              cars: [
                {
                  carId: car.id,
                  label: [car.brand, car.model, car.registrationNumber].filter(Boolean).join(" "),
                  expiresAt: exp.toISOString(),
                  daysUntil,
                },
              ],
              reminderDays,
            });
            if (sendRes?.ok) {
              await tenant.car.updateMany({
                where: { id: car.id, companyId: out.session.companyId },
                data: { itpLastNotifiedAt: new Date() },
              });
            } else {
              console.warn("[itp] immediate email not sent", { companyId: out.session.companyId, carId: car.id, error: sendRes?.error });
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("[itp] immediate email threw", { companyId: out.session.companyId, carId: id, error: e?.message || String(e) });
  }

  try {
    if (parsed.data.rcaExpiresAt !== undefined) {
      const exp = car?.rcaExpiresAt ? new Date(car.rcaExpiresAt) : null;
      if (exp && !Number.isNaN(exp.getTime())) {
        const reminderDays = Math.max(0, parseInt(process.env.RCA_REMINDER_DAYS || process.env.ITP_REMINDER_DAYS || "30", 10) || 30);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const cutoff = new Date(today.getTime() + reminderDays * 24 * 60 * 60 * 1000);
        if (exp.getTime() <= cutoff.getTime()) {
          const tenant = await getTenantPrisma(out.session.companyId);
          const admins = await tenant.companyMember.findMany({
            where: { companyId: out.session.companyId, role: "ADMIN", status: "ENROLLED" },
            include: { user: { select: { email: true } } },
          });
          const to = admins.map((m) => m.user?.email).filter(Boolean);
          if (to.length) {
            const expDay = new Date(exp);
            expDay.setHours(0, 0, 0, 0);
            const daysUntil = Math.ceil((expDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
            const sendRes = await sendRcaExpiryAdminEmail({
              to,
              companyName: out.company?.name || out.session.companyId,
              cars: [
                {
                  carId: car.id,
                  label: [car.brand, car.model, car.registrationNumber].filter(Boolean).join(" "),
                  expiresAt: exp.toISOString(),
                  daysUntil,
                },
              ],
              reminderDays,
            });
            if (sendRes?.ok) {
              await tenant.car.updateMany({
                where: { id: car.id, companyId: out.session.companyId },
                data: { rcaLastNotifiedAt: new Date() },
              });
            } else {
              console.warn("[rca] immediate email not sent", { companyId: out.session.companyId, carId: car.id, error: sendRes?.error });
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("[rca] immediate email threw", { companyId: out.session.companyId, carId: id, error: e?.message || String(e) });
  }

  const action = data.status && carBefore?.status !== data.status ? "CAR_STATUS_CHANGED" : "CAR_UPDATED";
  await writeAuditLog({
    companyId: out.session.companyId,
    actorId: out.session.userId,
    action,
    entityType: "CAR",
    entityId: id,
    meta: { before: carBefore ? { status: carBefore.status, km: carBefore.km } : null, after: data },
  });
  if (!car) return jsonResponse({ id });
  return jsonResponse({
    ...car,
    rcaDocumentUrl: rcaDocumentUrlForClient(car.id, car.rcaDocumentUrl),
  });
}

export async function DELETE(request, { params }) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  const out = await requireAdmin();
  if ("response" in out) return out.response;
  const { id } = await params;

  // Snapshot the car before deletion for the audit record
  let carSnap = null;
  try {
    carSnap = await getCarById(id, out.session.companyId);
  } catch (_) {}

  try {
    const provider = await getProvider(out.session.companyId, LAYERS.CARS);
    if (provider === PROVIDERS.SQL_SERVER) {
      const result = await deleteSqlServerCar(out.session.companyId, id);
      if (result.count === 0) return errorResponse("Car not found", 404);
      await writeAuditLog({
        companyId: out.session.companyId,
        actorId: out.session.userId,
        action: "CAR_DELETED",
        entityType: "CAR",
        entityId: id,
        meta: carSnap ? { brand: carSnap.brand, model: carSnap.model, registrationNumber: carSnap.registrationNumber } : null,
      });
      return jsonResponse({ ok: true });
    }
    if (provider !== PROVIDERS.LOCAL) return dataSourceNotConfiguredResponse(LAYERS.CARS);
  } catch (err) {
    console.error("DELETE /api/cars/[id] error:", err);
    return errorResponse(err?.message || "Failed to delete car", 500);
  }
  const result = await deleteCar(id, out.session.companyId);
  if (result.count === 0) return errorResponse("Car not found", 404);
  await writeAuditLog({
    companyId: out.session.companyId,
    actorId: out.session.userId,
    action: "CAR_DELETED",
    entityType: "CAR",
    entityId: id,
    meta: carSnap ? { brand: carSnap.brand, model: carSnap.model, registrationNumber: carSnap.registrationNumber } : null,
  });
  return jsonResponse({ ok: true });
}
