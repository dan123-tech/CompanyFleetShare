/**
 * GET /api/cars – list company cars (?status=available|reserved|in_maintenance)
 * POST /api/cars – (admin) create car
 */

import { z } from "zod";
import { listCars, createCar } from "@/lib/cars";
import { getProvider, getLayerTable, getStoredCredentials, LAYERS, PROVIDERS } from "@/lib/data-source-manager";
import { listSqlServerCars, createSqlServerCar } from "@/lib/connectors/sql-server-cars";
import {
  requireCompany,
  requireAdmin,
  jsonResponse,
  errorResponse,
  dataSourceNotConfiguredResponse,
  requireTrustedOriginForMutation,
} from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { rcaDocumentUrlForClient } from "@/lib/glovebox-ref";

const FUEL_TYPES = ["Benzine", "Diesel", "Electric", "Hybrid"];
const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const postSchema = z.object({
  brand: z.string().min(1).max(100),
  model: z.string().max(100).optional().nullable(),
  registrationNumber: z.string().min(1).max(50).transform((s) => s.trim().toUpperCase()),
  km: z.number().int().min(0).optional().default(0),
  status: z.enum(["AVAILABLE", "RESERVED", "IN_MAINTENANCE"]).optional().default("AVAILABLE"),
  fuelType: z.enum(FUEL_TYPES).optional().default("Benzine"),
  averageConsumptionL100km: z.union([z.number().min(0).max(30), z.null()]).optional(),
  averageConsumptionKwh100km: z.union([z.number().min(0).max(100), z.null()]).optional(),
  batteryLevel: z.union([z.number().min(0).max(100).int(), z.null()]).optional(),
  batteryCapacityKwh: z.union([z.number().min(0).max(500), z.null()]).optional(),
  lastServiceMileage: z.union([z.number().int().min(0), z.null()]).optional(),
  lastServiceYearMonth: z
    .preprocess((v) => (v === "" || v === null || v === undefined ? undefined : String(v).trim()), z.string().max(7).optional())
    .refine((v) => v === undefined || YEAR_MONTH.test(v), { message: "lastServiceYearMonth must be YYYY-MM" }),
  itpExpiresAt: z
    .preprocess((v) => (v === "" || v === null || v === undefined ? undefined : String(v)), z.string().datetime().optional()),
});

export async function GET(request) {
  const out = await requireCompany();
  if ("response" in out) return out.response;
  let provider;
  try {
    provider = await getProvider(out.session.companyId, LAYERS.CARS);
  } catch (err) {
    console.error("GET /api/cars (data source) error:", err);
    return errorResponse(err?.message || "Failed to load cars", 500);
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;

  if (provider === PROVIDERS.SQL_SERVER) {
    const tableName = await getLayerTable(out.session.companyId, LAYERS.CARS);
    if (!tableName) {
      return dataSourceNotConfiguredResponse(LAYERS.CARS, "Select a data table in Database Settings for the Cars layer.");
    }
    const creds = await getStoredCredentials(out.session.companyId, LAYERS.CARS, PROVIDERS.SQL_SERVER);
    if (!creds?.host || !creds?.username || !creds?.password) {
      return dataSourceNotConfiguredResponse(LAYERS.CARS, "SQL Server credentials not saved. Connect again in Database Settings.");
    }
    try {
      const cars = await listSqlServerCars(out.session.companyId, status);
      if (cars == null) {
        return dataSourceNotConfiguredResponse(LAYERS.CARS, "Could not load cars from SQL Server. Check table and credentials.");
      }
      return jsonResponse(
        cars.map((c) => ({
          id: c.id,
          brand: c.brand,
          model: c.model,
          registrationNumber: c.registrationNumber,
          km: c.km,
          status: c.status,
          fuelType: c.fuelType ?? "Benzine",
          averageConsumptionL100km: c.averageConsumptionL100km ?? null,
          averageConsumptionKwh100km: c.averageConsumptionKwh100km ?? null,
          batteryLevel: c.batteryLevel ?? null,
          batteryCapacityKwh: c.batteryCapacityKwh ?? null,
          lastServiceMileage: c.lastServiceMileage ?? null,
          lastServiceYearMonth: c.lastServiceYearMonth ?? null,
          itpExpiresAt: c.itpExpiresAt ?? null,
          _count: c._count ?? { reservations: 0 },
        }))
      );
    } catch (err) {
      console.error("GET /api/cars (SQL Server) error:", err);
      const msg = err?.message || String(err) || "Failed to load cars from SQL Server";
      return dataSourceNotConfiguredResponse(LAYERS.CARS, msg);
    }
  }

  if (provider !== PROVIDERS.LOCAL) {
    return dataSourceNotConfiguredResponse(LAYERS.CARS);
  }

  try {
    const cars = await listCars(out.session.companyId, status);
    return jsonResponse(
      cars.map((c) => ({
        id: c.id,
        brand: c.brand,
        model: c.model,
        registrationNumber: c.registrationNumber,
        km: c.km,
        status: c.status,
        fuelType: c.fuelType ?? "Benzine",
        averageConsumptionL100km: c.averageConsumptionL100km ?? null,
        averageConsumptionKwh100km: c.averageConsumptionKwh100km ?? null,
        batteryLevel: c.batteryLevel ?? null,
        batteryCapacityKwh: c.batteryCapacityKwh ?? null,
        lastServiceMileage: c.lastServiceMileage ?? null,
        lastServiceYearMonth: c.lastServiceYearMonth ?? null,
        itpExpiresAt: c.itpExpiresAt ?? null,
        rcaExpiresAt: c.rcaExpiresAt ?? null,
        rcaDocumentUrl: rcaDocumentUrlForClient(c.id, c.rcaDocumentUrl),
        rcaDocumentContentType: c.rcaDocumentContentType ?? null,
        vignetteExpiresAt: c.vignetteExpiresAt ?? null,
        _count: c._count,
      }))
    );
  } catch (err) {
    console.error("GET /api/cars (LOCAL) error:", err);
    const msg = err?.message || "Failed to load cars";
    return errorResponse(msg, 500);
  }
}

export async function POST(request) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  const out = await requireAdmin();
  if ("response" in out) return out.response;
  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("Invalid input", 422);
  const data = {
    ...parsed.data,
    ...(parsed.data.itpExpiresAt ? { itpExpiresAt: new Date(parsed.data.itpExpiresAt) } : {}),
  };

  try {
    const provider = await getProvider(out.session.companyId, LAYERS.CARS);
    if (provider === PROVIDERS.SQL_SERVER) {
      const tableName = await getLayerTable(out.session.companyId, LAYERS.CARS);
      if (!tableName) return dataSourceNotConfiguredResponse(LAYERS.CARS, "Select a data table in Database Settings for the Cars layer.");
      const creds = await getStoredCredentials(out.session.companyId, LAYERS.CARS, PROVIDERS.SQL_SERVER);
      if (!creds?.host || !creds?.username || !creds?.password) {
        return dataSourceNotConfiguredResponse(LAYERS.CARS, "SQL Server credentials not saved. Connect again in Database Settings.");
      }
      const car = await createSqlServerCar(out.session.companyId, data);
      if (!car) return dataSourceNotConfiguredResponse(LAYERS.CARS, "Could not create car in SQL Server.");
      await writeAuditLog({
        companyId: out.session.companyId,
        actorId: out.session.userId,
        action: "CAR_ADDED",
        entityType: "CAR",
        entityId: car.id,
        meta: { brand: car.brand, model: car.model, registrationNumber: car.registrationNumber },
      });
      return jsonResponse(
        {
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
        },
        201
      );
    }
    if (provider !== PROVIDERS.LOCAL) return dataSourceNotConfiguredResponse(LAYERS.CARS);
  } catch (err) {
    console.error("POST /api/cars error:", err);
    return errorResponse(err?.message || "Failed to create car", 500);
  }

  const car = await createCar(out.session.companyId, data);
  await writeAuditLog({
    companyId: out.session.companyId,
    actorId: out.session.userId,
    action: "CAR_ADDED",
    entityType: "CAR",
    entityId: car.id,
    meta: { brand: car.brand, model: car.model, registrationNumber: car.registrationNumber },
  });
  return jsonResponse(
    {
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
    },
    201
  );
}
