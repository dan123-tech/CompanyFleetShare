-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailBookingNotifications" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "calendarFeedToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_calendarFeedToken_key" ON "User"("calendarFeedToken");

-- CreateTable
CREATE TABLE "MaintenanceEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "mileageKm" INTEGER,
    "serviceType" VARCHAR(120) NOT NULL,
    "cost" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceEvent_companyId_performedAt_idx" ON "MaintenanceEvent"("companyId", "performedAt" DESC);
CREATE INDEX "MaintenanceEvent_carId_idx" ON "MaintenanceEvent"("carId");

-- AddForeignKey
ALTER TABLE "MaintenanceEvent" ADD CONSTRAINT "MaintenanceEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceEvent" ADD CONSTRAINT "MaintenanceEvent_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;
