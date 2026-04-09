import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { prisma as controlPrisma } from "@/lib/db";
import { ensureNeonTenantDatabase, provisionNeonTenant } from "@/lib/neon-tenants";

const tenantClients = new Map();
const MAX_TENANT_CLIENTS = 20;
const ALLOW_TENANT_FALLBACK = String(process.env.ALLOW_TENANT_FALLBACK || "").toLowerCase() === "true";
const tenantSchemaReady = new Set();
const PINNED_CONTROL_PLANE_COMPANIES = new Set(
  String(process.env.PINNED_CONTROL_PLANE_COMPANIES || "comp1")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

function isNeonUrl(url) {
  return /neon\.tech/i.test(url || "");
}

function createTenantClient(databaseUrl) {
  if (!databaseUrl) throw new Error("Tenant DATABASE_URL is missing");
  const log = process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];
  if (isNeonUrl(databaseUrl)) {
    const adapter = new PrismaNeon({ connectionString: databaseUrl });
    return new PrismaClient({ adapter, log });
  }
  return new PrismaClient({ datasources: { db: { url: databaseUrl } }, log });
}

export function createTempTenantClient(databaseUrl) {
  return createTenantClient(databaseUrl);
}

function isUsableDatabaseUrl(url) {
  const v = String(url || "").trim();
  if (!v) return false;
  if (v.startsWith("pending://")) return false;
  return v.startsWith("postgres://") || v.startsWith("postgresql://");
}

function parseDbIdentity(url) {
  try {
    const u = new URL(url);
    const db = (u.pathname || "").replace(/^\/+/, "");
    if (!u.hostname || !db) return null;
    return { host: u.hostname.toLowerCase(), db: db.toLowerCase() };
  } catch {
    return null;
  }
}

function isMappedToControlPlaneDatabase(url) {
  const controlUrl = process.env.DATABASE_URL;
  if (!controlUrl || !isUsableDatabaseUrl(controlUrl) || !isUsableDatabaseUrl(url)) return false;
  const a = parseDbIdentity(controlUrl);
  const b = parseDbIdentity(url);
  return Boolean(a && b && a.host === b.host && a.db === b.db);
}

async function isPinnedToControlPlane(companyId) {
  if (PINNED_CONTROL_PLANE_COMPANIES.has(String(companyId || "").toLowerCase())) return true;
  const company = await controlPrisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, joinCode: true, domain: true },
  });
  if (!company) return false;
  const aliases = [company.name, company.joinCode, company.domain]
    .map((v) => String(v || "").trim().toLowerCase())
    .filter(Boolean);
  return aliases.some((v) => PINNED_CONTROL_PLANE_COMPANIES.has(v));
}

function touchClient(companyId, client) {
  if (tenantClients.has(companyId)) tenantClients.delete(companyId);
  tenantClients.set(companyId, client);
  if (tenantClients.size > MAX_TENANT_CLIENTS) {
    const oldest = tenantClients.keys().next().value;
    const oldestClient = tenantClients.get(oldest);
    tenantClients.delete(oldest);
    oldestClient?.$disconnect?.().catch(() => {});
  }
}

async function seedTenantFromControlPlane(client, companyId) {
  const company = await controlPrisma.company.findUnique({
    where: { id: companyId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              password: true,
              name: true,
            },
          },
        },
      },
    },
  });
  if (!company) throw new Error("Company not found for tenant provisioning");

  await client.$transaction(async (tx) => {
    await tx.company.upsert({
      where: { id: company.id },
      update: {
        name: company.name,
        domain: company.domain,
        joinCode: company.joinCode,
      },
      create: {
        id: company.id,
        name: company.name,
        domain: company.domain,
        joinCode: company.joinCode,
      },
    });

    for (const m of company.members || []) {
      if (!m?.user?.id) continue;
      await tx.user.upsert({
        where: { id: m.user.id },
        update: {
          email: m.user.email,
          password: m.user.password,
          name: m.user.name,
        },
        create: {
          id: m.user.id,
          email: m.user.email,
          password: m.user.password,
          name: m.user.name,
        },
      });
      await tx.companyMember.upsert({
        where: { userId_companyId: { userId: m.user.id, companyId: company.id } },
        update: { role: m.role, status: m.status },
        create: {
          id: `${company.id}_${m.user.id}`,
          userId: m.user.id,
          companyId: company.id,
          role: m.role,
          status: m.status,
        },
      });
    }
  });
}

async function bootstrapTenantSchema(client) {
  await client.$executeRawUnsafe(`
DO $$ BEGIN CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "MemberStatus" AS ENUM ('ENROLLED', 'PENDING_INVITE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CarStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'IN_MAINTENANCE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ExceededApprovalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "FuelType" AS ENUM ('Benzine', 'Diesel', 'Electric', 'Hybrid'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AuditAction" AS ENUM (
  'CAR_ADDED','CAR_UPDATED','CAR_STATUS_CHANGED','CAR_DELETED',
  'RESERVATION_CREATED','RESERVATION_CANCELLED','RESERVATION_COMPLETED','RESERVATION_EXTENDED',
  'KM_EXCEEDED_APPROVED','KM_EXCEEDED_REJECTED','PRICING_CHANGED','COMPANY_SETTINGS_CHANGED',
  'USER_INVITED','USER_ROLE_CHANGED','USER_REMOVED','DRIVING_LICENCE_STATUS_CHANGED'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`);

  await client.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "password" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "drivingLicenceUrl" TEXT,
  "drivingLicenceStatus" TEXT,
  "drivingLicenceVerifiedBy" TEXT,
  "selfieUrl" TEXT,
  "identityStatus" TEXT,
  "identityVerifiedAt" TIMESTAMP(3),
  "identityVerifiedBy" TEXT,
  "identityScore" DOUBLE PRECISION,
  "identityReason" TEXT,
  "fcmToken" TEXT,
  "fcmTokenUpdatedAt" TIMESTAMP(3),
  "activeWebSessionToken" TEXT,
  "activeMobileSessionToken" TEXT,
  "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  "mfaOtpHash" TEXT,
  "mfaOtpExpiresAt" TIMESTAMP(3),
  "mfaOtpAttempts" INTEGER NOT NULL DEFAULT 0,
  "emailBookingNotifications" BOOLEAN NOT NULL DEFAULT true,
  "calendarFeedToken" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Company" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "domain" TEXT,
  "joinCode" TEXT UNIQUE,
  "defaultKmUsage" INTEGER NOT NULL DEFAULT 100,
  "averageFuelPricePerLiter" DOUBLE PRECISION,
  "defaultConsumptionL100km" DOUBLE PRECISION DEFAULT 7.5,
  "priceBenzinePerLiter" DOUBLE PRECISION,
  "priceDieselPerLiter" DOUBLE PRECISION,
  "priceHybridPerLiter" DOUBLE PRECISION,
  "priceElectricityPerKwh" DOUBLE PRECISION,
  "dataSourceConfig" JSONB,
  "dataSourceCredentials" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "CompanyMember" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'USER',
  "status" "MemberStatus" NOT NULL DEFAULT 'PENDING_INVITE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompanyMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompanyMember_userId_companyId_key" UNIQUE ("userId","companyId")
);

CREATE TABLE IF NOT EXISTS "Invite" (
  "id" TEXT PRIMARY KEY,
  "token" TEXT NOT NULL UNIQUE,
  "email" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Car" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "model" TEXT,
  "registrationNumber" TEXT NOT NULL,
  "km" INTEGER NOT NULL DEFAULT 0,
  "status" "CarStatus" NOT NULL DEFAULT 'AVAILABLE',
  "fuelType" "FuelType" NOT NULL DEFAULT 'Benzine',
  "averageConsumptionL100km" DOUBLE PRECISION,
  "averageConsumptionKwh100km" DOUBLE PRECISION,
  "batteryLevel" INTEGER,
  "batteryCapacityKwh" DOUBLE PRECISION,
  "lastServiceMileage" INTEGER,
  "lastServiceYearMonth" VARCHAR(7),
  "itpExpiresAt" TIMESTAMP(3),
  "itpLastNotifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Car_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MaintenanceEvent" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "carId" TEXT NOT NULL,
  "performedAt" TIMESTAMP(3) NOT NULL,
  "mileageKm" INTEGER,
  "serviceType" VARCHAR(120) NOT NULL,
  "cost" DOUBLE PRECISION,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceEvent_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Reservation" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "carId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "purpose" TEXT,
  "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "pickup_code" TEXT,
  "code_valid_from" TIMESTAMP(3),
  "release_code" TEXT,
  "releasedKmUsed" INTEGER,
  "releasedExceededReason" TEXT,
  "releasedExceededStatus" "ExceededApprovalStatus",
  "releasedExceededAdminComment" TEXT,
  "pushReminderBeforeStartSentAt" TIMESTAMP(3),
  "pushReminderStartSentAt" TIMESTAMP(3),
  "pushReminderEndSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Reservation_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MobileCaptureSession" (
  "id" TEXT PRIMARY KEY,
  "token" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "emailSentAt" TIMESTAMP(3),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileCaptureSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MobileCaptureSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" "AuditAction" NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeWebSessionToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeMobileSessionToken" TEXT;

CREATE TABLE IF NOT EXISTS "IncidentReport" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "carId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reservationId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "severity" VARCHAR(1) NOT NULL DEFAULT 'C',
  "title" VARCHAR(140) NOT NULL,
  "description" TEXT,
  "location" VARCHAR(200),
  "status" VARCHAR(40) NOT NULL DEFAULT 'SUBMITTED',
  "adminNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncidentReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IncidentReport_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IncidentReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IncidentReport_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "IncidentAttachment" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "kind" VARCHAR(30) NOT NULL DEFAULT 'PHOTO',
  "filename" VARCHAR(260) NOT NULL,
  "contentType" VARCHAR(120) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "blobUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncidentAttachment_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "IncidentReport"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "IncidentReport_companyId_createdAt_idx" ON "IncidentReport"("companyId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "IncidentReport_carId_createdAt_idx" ON "IncidentReport"("carId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "IncidentReport_userId_createdAt_idx" ON "IncidentReport"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "IncidentReport_status_idx" ON "IncidentReport"("status");
CREATE INDEX IF NOT EXISTS "IncidentAttachment_incidentId_createdAt_idx" ON "IncidentAttachment"("incidentId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "IncidentAttachment_companyId_createdAt_idx" ON "IncidentAttachment"("companyId", "createdAt" DESC);
`);
}

async function ensureTenantSchemaCompatibility(client) {
  await client.$executeRawUnsafe(`
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeWebSessionToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeMobileSessionToken" TEXT;
ALTER TABLE "Car" ADD COLUMN IF NOT EXISTS "itpExpiresAt" TIMESTAMP(3);
ALTER TABLE "Car" ADD COLUMN IF NOT EXISTS "itpLastNotifiedAt" TIMESTAMP(3);
ALTER TABLE "IncidentReport" ADD COLUMN IF NOT EXISTS "severity" VARCHAR(1) NOT NULL DEFAULT 'C';

CREATE TABLE IF NOT EXISTS "MobileCaptureSession" (
  "id" TEXT PRIMARY KEY,
  "token" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "emailSentAt" TIMESTAMP(3),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileCaptureSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MobileCaptureSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "IncidentReport" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "carId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reservationId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "severity" VARCHAR(1) NOT NULL DEFAULT 'C',
  "title" VARCHAR(140) NOT NULL,
  "description" TEXT,
  "location" VARCHAR(200),
  "status" VARCHAR(40) NOT NULL DEFAULT 'SUBMITTED',
  "adminNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncidentReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IncidentReport_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IncidentReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IncidentReport_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "IncidentAttachment" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "kind" VARCHAR(30) NOT NULL DEFAULT 'PHOTO',
  "filename" VARCHAR(260) NOT NULL,
  "contentType" VARCHAR(120) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "blobUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncidentAttachment_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "IncidentReport"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "IncidentReport_companyId_createdAt_idx" ON "IncidentReport"("companyId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "IncidentReport_carId_createdAt_idx" ON "IncidentReport"("carId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "IncidentReport_userId_createdAt_idx" ON "IncidentReport"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "IncidentReport_status_idx" ON "IncidentReport"("status");
CREATE INDEX IF NOT EXISTS "IncidentAttachment_incidentId_createdAt_idx" ON "IncidentAttachment"("incidentId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "IncidentAttachment_companyId_createdAt_idx" ON "IncidentAttachment"("companyId", "createdAt" DESC);
`);
}

async function ensureTenantSchemaWithClient(companyId, client) {
  if (!companyId) throw new Error("companyId is required");
  if (tenantSchemaReady.has(companyId)) return;
  const rows = await client.$queryRawUnsafe(`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'User'
    LIMIT 1
  `);
  if (!Array.isArray(rows) || rows.length === 0) {
    await bootstrapTenantSchema(client);
  }
  await ensureTenantSchemaCompatibility(client);
  tenantSchemaReady.add(companyId);
}

async function autoProvisionMissingTenant(companyId) {
  const existing = await controlPrisma.companyTenant.findUnique({ where: { companyId } });
  if (existing) return existing;

  const company = await controlPrisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) {
    throw new Error("Company tenant database is not configured yet");
  }

  await controlPrisma.companyTenant.upsert({
    where: { companyId },
    update: {
      provisioningStatus: "PROVISIONING",
      provisioningError: null,
    },
    create: {
      companyId,
      provider: "neon",
      databaseUrl: "pending://provisioning",
      provisioningStatus: "PROVISIONING",
    },
  });

  try {
    const provisioned = await provisionNeonTenant({
      companyId: company.id,
      companyName: company.name,
    });
    await controlPrisma.companyTenant.update({
      where: { companyId },
      data: {
        ...provisioned,
        provisioningStatus: "READY",
        provisioningError: null,
      },
    });

    const tempClient = createTenantClient(provisioned.databaseUrl);
    try {
      await bootstrapTenantSchema(tempClient);
      await ensureTenantSchemaCompatibility(tempClient);
      await seedTenantFromControlPlane(tempClient, companyId);
    } finally {
      await tempClient.$disconnect().catch(() => {});
    }
    return controlPrisma.companyTenant.findUnique({ where: { companyId } });
  } catch (err) {
    await controlPrisma.companyTenant.update({
      where: { companyId },
      data: {
        provisioningStatus: "FAILED",
        provisioningError: err?.message?.slice?.(0, 1000) || "Tenant provisioning failed",
      },
    });
    throw err;
  }
}

async function reprovisionDedicatedTenant(companyId) {
  const company = await controlPrisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) {
    throw new Error("Company tenant database is not configured yet");
  }
  await controlPrisma.companyTenant.update({
    where: { companyId },
    data: {
      provisioningStatus: "PROVISIONING",
      provisioningError: null,
    },
  });
  try {
    const provisioned = await provisionNeonTenant({
      companyId: company.id,
      companyName: company.name,
    });
    await controlPrisma.companyTenant.update({
      where: { companyId },
      data: {
        ...provisioned,
        provisioningStatus: "READY",
        provisioningError: null,
      },
    });

    const tempClient = createTenantClient(provisioned.databaseUrl);
    try {
      await bootstrapTenantSchema(tempClient);
      await ensureTenantSchemaCompatibility(tempClient);
      await seedTenantFromControlPlane(tempClient, companyId);
    } finally {
      await tempClient.$disconnect().catch(() => {});
    }
    return controlPrisma.companyTenant.findUnique({ where: { companyId } });
  } catch (err) {
    await controlPrisma.companyTenant.update({
      where: { companyId },
      data: {
        provisioningStatus: "FAILED",
        provisioningError: err?.message?.slice?.(0, 1000) || "Tenant reprovisioning failed",
      },
    });
    throw err;
  }
}

export async function ensureTenantSchema(companyId) {
  if (!companyId) throw new Error("companyId is required");
  if (tenantSchemaReady.has(companyId)) return;
  const client = await getTenantPrisma(companyId);
  await ensureTenantSchemaWithClient(companyId, client);
}

export async function getTenantConfig(companyId) {
  if (!companyId) throw new Error("companyId is required");
  const controlDbUrl = String(process.env.DATABASE_URL || "").trim();
  if (await isPinnedToControlPlane(companyId)) {
    if (!isUsableDatabaseUrl(controlDbUrl)) {
      throw new Error("DATABASE_URL is required for control-plane pinned company");
    }
    return {
      companyId,
      provider: "neon",
      databaseUrl: controlDbUrl,
      branchId: process.env.NEON_ROOT_BRANCH_ID?.trim() || "br-main",
      branchName: `root-${process.env.NEON_ROOT_BRANCH_ID?.trim() || "br-main"}`,
      databaseName: parseDbIdentity(controlDbUrl)?.db || "neondb",
      provisioningStatus: "READY",
      provisioningError: null,
    };
  }
  let cfg = await controlPrisma.companyTenant.findUnique({ where: { companyId } });
  if (!cfg) {
    cfg = await autoProvisionMissingTenant(companyId);
  }
  if (cfg.provisioningStatus === "READY" && isUsableDatabaseUrl(cfg.databaseUrl)) {
    if (cfg.provider === "neon" && isMappedToControlPlaneDatabase(cfg.databaseUrl)) {
      cfg = await reprovisionDedicatedTenant(companyId);
    }
    return cfg;
  }

  // Graceful runtime fallback: if tenant provisioning is blocked/failed, keep the company usable
  // on control-plane DB instead of hard failing requests with 503.
  if (ALLOW_TENANT_FALLBACK && isUsableDatabaseUrl(controlDbUrl)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[tenant-db] fallback to control DATABASE_URL", {
        companyId,
        provisioningStatus: cfg.provisioningStatus,
      });
    }
    return {
      ...cfg,
      databaseUrl: isUsableDatabaseUrl(cfg.databaseUrl) ? cfg.databaseUrl : controlDbUrl,
    };
  }

  throw new Error(`Company tenant database not ready: ${cfg.provisioningStatus}`);
}

export async function getTenantPrisma(companyId) {
  if (tenantClients.has(companyId)) {
    const client = tenantClients.get(companyId);
    touchClient(companyId, client);
    if (!tenantSchemaReady.has(companyId)) {
      await ensureTenantSchemaWithClient(companyId, client);
    }
    return client;
  }
  const cfg = await getTenantConfig(companyId);
  let client = createTenantClient(cfg.databaseUrl);
  try {
    await client.$queryRawUnsafe("SELECT 1");
  } catch (e) {
    const msg = String(e?.message || "");
    if (cfg.provider === "neon" && (msg.includes("3D000") || msg.includes("does not exist"))) {
      const repaired = await ensureNeonTenantDatabase({
        companyId,
        branchId: cfg.branchId || undefined,
        databaseName: cfg.databaseName || undefined,
        existingDatabaseUrl: cfg.databaseUrl || undefined,
      });
      await controlPrisma.companyTenant.update({
        where: { companyId },
        data: {
          branchId: repaired.branchId,
          databaseName: repaired.databaseName,
          databaseUrl: repaired.databaseUrl,
          provisioningStatus: "READY",
          provisioningError: null,
        },
      });
      await client.$disconnect().catch(() => {});
      client = createTenantClient(repaired.databaseUrl);
      await client.$queryRawUnsafe("SELECT 1");
    } else {
      throw e;
    }
  }
  touchClient(companyId, client);
  if (!tenantSchemaReady.has(companyId)) {
    await ensureTenantSchemaWithClient(companyId, client);
  }
  return client;
}

export async function withTenant(companyId, fn) {
  const tenant = await getTenantPrisma(companyId);
  return fn(tenant);
}
