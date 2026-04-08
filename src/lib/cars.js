/**
 * Car domain logic: CRUD and listing by company/status.
 */

import { getTenantPrisma, createTempTenantClient } from "@/lib/tenant-db";
import { prisma as controlPrisma } from "@/lib/db";

async function backfillCarsFromLegacyIfEmpty(companyId) {
  const legacyUrl = String(process.env.DATABASE_URL || "").trim();
  if (!legacyUrl) return;

  const cfg = await controlPrisma.companyTenant.findUnique({
    where: { companyId },
    select: { databaseUrl: true },
  });
  if (!cfg?.databaseUrl) return;
  if (cfg.databaseUrl === legacyUrl) return;

  const tenant = await getTenantPrisma(companyId);
  const hasCars = await tenant.car.count({ where: { companyId } });
  if (hasCars > 0) return;

  const legacy = createTempTenantClient(legacyUrl);
  try {
    const legacyCars = await legacy.car.findMany({
      where: { companyId },
      orderBy: { createdAt: "asc" },
    });
    if (!legacyCars.length) return;
    await tenant.car.createMany({
      data: legacyCars.map((c) => ({
        id: c.id,
        companyId: c.companyId,
        brand: c.brand,
        model: c.model,
        registrationNumber: c.registrationNumber,
        km: c.km,
        status: c.status,
        fuelType: c.fuelType,
        averageConsumptionL100km: c.averageConsumptionL100km,
        averageConsumptionKwh100km: c.averageConsumptionKwh100km,
        batteryLevel: c.batteryLevel,
        batteryCapacityKwh: c.batteryCapacityKwh,
        lastServiceMileage: c.lastServiceMileage,
        lastServiceYearMonth: c.lastServiceYearMonth,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      skipDuplicates: true,
    });
  } catch {
    // Best-effort legacy recovery only; do not fail car listing.
  } finally {
    await legacy.$disconnect().catch(() => {});
  }
}

/**
 * List cars for a company with optional status filter.
 * @param {string} companyId - Company id
 * @param {string} [status] - Optional: AVAILABLE, RESERVED, IN_MAINTENANCE
 * @returns {Promise<Object[]>} Cars with reservation count
 */
export async function listCars(companyId, status) {
  await backfillCarsFromLegacyIfEmpty(companyId);
  const prisma = await getTenantPrisma(companyId);
  return prisma.car.findMany({
    where: { companyId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { reservations: true } } },
  });
}

/**
 * Get a single car by id; ensure it belongs to the given company.
 * @param {string} carId
 * @param {string} companyId
 * @returns {Promise<Object|null>}
 */
export async function getCarById(carId, companyId) {
  await backfillCarsFromLegacyIfEmpty(companyId);
  const prisma = await getTenantPrisma(companyId);
  return prisma.car.findFirst({
    where: { id: carId, companyId },
    include: {
      reservations: {
        orderBy: { startDate: "desc" },
        take: 20,
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });
}

/**
 * Create a new car for the company (admin only).
 * @param {string} companyId
 * @param {Object} data - { brand, model?, registrationNumber, km?, status?, fuelType?, averageConsumptionL100km?, averageConsumptionKwh100km?, batteryLevel?, batteryCapacityKwh?, lastServiceMileage?, lastServiceYearMonth? }
 * @returns {Promise<Object>}
 */
export async function createCar(companyId, data) {
  const prisma = await getTenantPrisma(companyId);
  const lastYm =
    data.lastServiceYearMonth != null && String(data.lastServiceYearMonth).trim() !== ""
      ? String(data.lastServiceYearMonth).trim()
      : null;
  return prisma.car.create({
    data: {
      companyId,
      brand: data.brand.trim(),
      model: data.model?.trim() || null,
      registrationNumber: data.registrationNumber.trim().toUpperCase(),
      km: data.km ?? 0,
      status: data.status ?? "AVAILABLE",
      fuelType: data.fuelType ?? "Benzine",
      averageConsumptionL100km: data.averageConsumptionL100km != null ? Number(data.averageConsumptionL100km) : null,
      averageConsumptionKwh100km: data.averageConsumptionKwh100km != null ? Number(data.averageConsumptionKwh100km) : null,
      batteryLevel: data.batteryLevel != null ? Math.min(100, Math.max(0, Number(data.batteryLevel))) : null,
      batteryCapacityKwh: data.batteryCapacityKwh != null ? Number(data.batteryCapacityKwh) : null,
      lastServiceMileage: data.lastServiceMileage != null ? Number(data.lastServiceMileage) : null,
      ...(lastYm != null ? { lastServiceYearMonth: lastYm } : {}),
    },
  });
}

/**
 * Update a car (admin only). Partial update.
 * @param {string} carId
 * @param {string} companyId
 * @param {Object} data - Partial car fields
 * @returns {Promise<Object>} updateMany result
 */
export async function updateCar(carId, companyId, data) {
  const prisma = await getTenantPrisma(companyId);
  const update = {
    ...(data.brand !== undefined && { brand: data.brand.trim() }),
    ...(data.model !== undefined && { model: data.model?.trim() || null }),
    ...(data.registrationNumber !== undefined && { registrationNumber: data.registrationNumber.trim().toUpperCase() }),
    ...(data.km !== undefined && { km: data.km }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.fuelType !== undefined && { fuelType: data.fuelType }),
    ...(data.averageConsumptionL100km !== undefined && {
      averageConsumptionL100km: data.averageConsumptionL100km == null ? null : Number(data.averageConsumptionL100km),
    }),
    ...(data.averageConsumptionKwh100km !== undefined && {
      averageConsumptionKwh100km: data.averageConsumptionKwh100km == null ? null : Number(data.averageConsumptionKwh100km),
    }),
    ...(data.batteryLevel !== undefined && {
      batteryLevel: data.batteryLevel == null ? null : Math.min(100, Math.max(0, Number(data.batteryLevel))),
    }),
    ...(data.batteryCapacityKwh !== undefined && {
      batteryCapacityKwh: data.batteryCapacityKwh == null ? null : Number(data.batteryCapacityKwh),
    }),
    ...(data.lastServiceMileage !== undefined && {
      lastServiceMileage: data.lastServiceMileage == null ? null : Number(data.lastServiceMileage),
    }),
    ...(data.lastServiceYearMonth !== undefined && {
      lastServiceYearMonth:
        data.lastServiceYearMonth == null || String(data.lastServiceYearMonth).trim() === ""
          ? null
          : String(data.lastServiceYearMonth).trim(),
    }),
  };
  return prisma.car.updateMany({
    where: { id: carId, companyId },
    data: update,
  });
}

/**
 * Delete a car (admin only).
 * @param {string} carId
 * @param {string} companyId
 * @returns {Promise<Object>} deleteMany result
 */
export async function deleteCar(carId, companyId) {
  const prisma = await getTenantPrisma(companyId);
  return prisma.car.deleteMany({
    where: { id: carId, companyId },
  });
}
