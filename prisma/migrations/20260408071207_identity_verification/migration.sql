-- CreateEnum
CREATE TYPE "IdentityStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'PENDING_REVIEW');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "selfieUrl" TEXT,
ADD COLUMN "identityStatus" "IdentityStatus",
ADD COLUMN "identityVerifiedAt" TIMESTAMP(3),
ADD COLUMN "identityVerifiedBy" TEXT,
ADD COLUMN "identityScore" DOUBLE PRECISION,
ADD COLUMN "identityReason" TEXT;

