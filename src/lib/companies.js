/**
 * Company and CompanyMember domain logic.
 * Used by API routes to resolve current company, create company, join by code.
 */

import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";
import { provisionNeonTenant } from "@/lib/neon-tenants";
import { ensureTenantSchema, getTenantPrisma } from "@/lib/tenant-db";

const JOIN_CODE_LENGTH = 8;
const JOIN_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0,O,1,I to avoid confusion
const ALLOW_TENANT_FALLBACK = String(process.env.ALLOW_TENANT_FALLBACK || "").toLowerCase() === "true";

function generateJoinCode() {
  const bytes = randomBytes(JOIN_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_CHARS[bytes[i] % JOIN_CODE_CHARS.length];
  }
  return code;
}

/**
 * Fetch a company by ID with optional member count.
 * @param {string} companyId - Company cuid
 * @returns {Promise<Object|null>} Company or null
 */
export async function getCompanyById(companyId) {
  try {
    const tenant = await getTenantPrisma(companyId);
    return await tenant.company.findUnique({
      where: { id: companyId },
      include: { _count: { select: { members: true, cars: true } } },
    });
  } catch {
    // Fallback to control-plane company so auth/session still works while tenant provisioning is pending/failed.
    return prisma.company.findUnique({
      where: { id: companyId },
      include: { _count: { select: { members: true, cars: true } } },
    });
  }
}

/**
 * Get the current user's membership in a company (role and status).
 * @param {string} userId - User id
 * @param {string} companyId - Company id
 * @returns {Promise<Object|null>} CompanyMember or null
 */
export async function getMembership(userId, companyId) {
  return prisma.companyMember.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
}

/**
 * Check if the user is an ADMIN for the given company.
 * @param {string} userId - User id
 * @param {string} companyId - Company id
 * @returns {Promise<boolean>} True if member exists and role is ADMIN
 */
export async function isCompanyAdmin(userId, companyId) {
  const m = await getMembership(userId, companyId);
  return m?.role === "ADMIN";
}

/**
 * Update company (admin only). Fields: name?, domain?, joinCode?, defaultKmUsage?, averageFuelPricePerLiter?, defaultConsumptionL100km?, priceBenzinePerLiter?, priceDieselPerLiter?, priceHybridPerLiter?, priceElectricityPerKwh?
 * @param {string} companyId - Company id
 * @param {Object} data
 */
export async function updateCompany(companyId, data) {
  const allowed = [
    "name", "domain", "joinCode", "defaultKmUsage", "averageFuelPricePerLiter",
    "defaultConsumptionL100km", "priceBenzinePerLiter", "priceDieselPerLiter", "priceHybridPerLiter", "priceElectricityPerKwh",
    "dataSourceConfig",
  ];
  const update = {};
  for (const key of allowed) {
    if (data[key] !== undefined) update[key] = data[key];
  }
  const tenant = await getTenantPrisma(companyId);
  return tenant.company.update({
    where: { id: companyId },
    data: update,
  });
}

async function seedTenantCompanyData({ company, ownerUser }) {
  await ensureTenantSchema(company.id);
  const tenant = await getTenantPrisma(company.id);
  await tenant.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { id: ownerUser.id },
      update: { email: ownerUser.email, name: ownerUser.name },
      create: {
        id: ownerUser.id,
        email: ownerUser.email,
        password: ownerUser.password,
        name: ownerUser.name,
      },
    });
    await tx.company.upsert({
      where: { id: company.id },
      update: { name: company.name, domain: company.domain, joinCode: company.joinCode },
      create: {
        id: company.id,
        name: company.name,
        domain: company.domain,
        joinCode: company.joinCode,
      },
    });
    await tx.companyMember.upsert({
      where: { userId_companyId: { userId: ownerUser.id, companyId: company.id } },
      update: { role: "ADMIN", status: "ENROLLED" },
      create: {
        id: `${company.id}_${ownerUser.id}`,
        userId: ownerUser.id,
        companyId: company.id,
        role: "ADMIN",
        status: "ENROLLED",
      },
    });
  });
}

/**
 * Create a new company and add the user as ADMIN (enrolled).
 * Generates a unique joinCode for others to join.
 * @param {string} userId - Creator user id
 * @param {Object} data - { name, domain? }
 * @returns {Promise<Object>} Company with joinCode
 */
export async function createCompany(userId, data) {
  let joinCode;
  let existing;
  do {
    joinCode = generateJoinCode();
    existing = await prisma.company.findUnique({ where: { joinCode } });
  } while (existing);

  return prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: data.name.trim(),
        domain: data.domain?.trim() || null,
        joinCode,
      },
    });
    await tx.companyMember.create({
      data: {
        userId,
        companyId: company.id,
        role: "ADMIN",
        status: "ENROLLED",
      },
    });
    await tx.companyTenant.create({
      data: {
        companyId: company.id,
        provider: "neon",
        databaseUrl: "pending://provisioning",
        provisioningStatus: "PROVISIONING",
      },
    });
    return company;
  });
}

export async function createCompanyWithTenant(userId, data) {
  const company = await createCompany(userId, data);
  try {
    console.info("[tenant] provisioning started", { companyId: company.id });
    const provisioned = await provisionNeonTenant({
      companyId: company.id,
      companyName: company.name,
    });
    await prisma.companyTenant.update({
      where: { companyId: company.id },
      data: {
        ...provisioned,
        provisioningStatus: "READY",
        provisioningError: null,
      },
    });
    const owner = await prisma.user.findUnique({ where: { id: userId } });
    if (owner) {
      await seedTenantCompanyData({ company, ownerUser: owner });
    }
    console.info("[tenant] provisioning ready", { companyId: company.id, branchId: provisioned.branchId });
    return { company, tenantStatus: "READY", tenantFallback: false, tenantError: null };
  } catch (error) {
    console.error("[tenant] provisioning failed", { companyId: company.id, error: error?.message });
    const fallbackDbUrl = process.env.DATABASE_URL?.trim();
    if (ALLOW_TENANT_FALLBACK && fallbackDbUrl) {
      await prisma.companyTenant.update({
        where: { companyId: company.id },
        data: {
          provisioningStatus: "READY",
          databaseUrl: fallbackDbUrl,
          provisioningError:
            `FALLBACK_TO_CONTROL_DB: ${error?.message?.slice?.(0, 900) || "Tenant provisioning failed"}`,
        },
      });
      const owner = await prisma.user.findUnique({ where: { id: userId } });
      if (owner) {
        await seedTenantCompanyData({ company, ownerUser: owner });
      }
      return {
        company,
        tenantStatus: "READY",
        tenantFallback: true,
        tenantError: error?.message?.slice?.(0, 1000) || "Tenant provisioning failed",
      };
    }

    await prisma.companyTenant.update({
      where: { companyId: company.id },
      data: {
        provisioningStatus: "FAILED",
        provisioningError: error?.message?.slice(0, 1000) || "Tenant provisioning failed",
      },
    });
    throw error;
  }
}

/**
 * Find company by join code (for joining).
 * @param {string} joinCode
 * @returns {Promise<Object|null>}
 */
export async function findCompanyByJoinCode(joinCode) {
  const normalized = String(joinCode).trim().toUpperCase();
  if (!normalized) return null;
  return prisma.company.findUnique({
    where: { joinCode: normalized },
  });
}

/**
 * Add user to a company by join code (enrolled as USER).
 * @param {string} userId - User id
 * @param {string} joinCode - Company join code
 * @returns {Promise<Object|null>} CompanyMember with company, or null if code invalid or already member
 */
export async function joinCompanyByCode(userId, joinCode) {
  const company = await findCompanyByJoinCode(joinCode);
  if (!company) return null;

  const enrolledElsewhere = await prisma.companyMember.findFirst({
    where: {
      userId,
      status: "ENROLLED",
      companyId: { not: company.id },
    },
    select: { companyId: true },
  });
  if (enrolledElsewhere) {
    throw new Error("Your account is already enrolled in another company.");
  }

  const existing = await prisma.companyMember.findUnique({
    where: { userId_companyId: { userId, companyId: company.id } },
  });
  if (existing) return null;

  const member = await prisma.companyMember.create({
    data: {
      userId,
      companyId: company.id,
      role: "USER",
      status: "ENROLLED",
    },
    include: { company: true },
  });
  return member;
}
