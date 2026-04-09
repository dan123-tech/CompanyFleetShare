-- AlterTable
ALTER TABLE "Car" ADD COLUMN "itpExpiresAt" TIMESTAMP(3);
ALTER TABLE "Car" ADD COLUMN "itpLastNotifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "IncidentReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reservationId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "title" VARCHAR(140) NOT NULL,
    "description" TEXT,
    "location" VARCHAR(200),
    "status" VARCHAR(40) NOT NULL DEFAULT 'SUBMITTED',
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentAttachment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "kind" VARCHAR(30) NOT NULL DEFAULT 'PHOTO',
    "filename" VARCHAR(260) NOT NULL,
    "contentType" VARCHAR(120) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncidentReport_companyId_createdAt_idx" ON "IncidentReport"("companyId", "createdAt" DESC);
CREATE INDEX "IncidentReport_carId_createdAt_idx" ON "IncidentReport"("carId", "createdAt" DESC);
CREATE INDEX "IncidentReport_userId_createdAt_idx" ON "IncidentReport"("userId", "createdAt" DESC);
CREATE INDEX "IncidentReport_status_idx" ON "IncidentReport"("status");

CREATE INDEX "IncidentAttachment_incidentId_createdAt_idx" ON "IncidentAttachment"("incidentId", "createdAt" DESC);
CREATE INDEX "IncidentAttachment_companyId_createdAt_idx" ON "IncidentAttachment"("companyId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IncidentAttachment" ADD CONSTRAINT "IncidentAttachment_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "IncidentReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
