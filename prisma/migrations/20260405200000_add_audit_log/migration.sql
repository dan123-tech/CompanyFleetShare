-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CAR_ADDED', 'CAR_UPDATED', 'CAR_STATUS_CHANGED', 'CAR_DELETED', 'RESERVATION_CREATED', 'RESERVATION_CANCELLED', 'RESERVATION_COMPLETED', 'RESERVATION_EXTENDED', 'KM_EXCEEDED_APPROVED', 'KM_EXCEEDED_REJECTED', 'PRICING_CHANGED', 'COMPANY_SETTINGS_CHANGED', 'USER_INVITED', 'USER_ROLE_CHANGED', 'USER_REMOVED', 'DRIVING_LICENCE_STATUS_CHANGED');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_companyId_action_idx" ON "AuditLog"("companyId", "action");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_entityType_entityId_idx" ON "AuditLog"("companyId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
