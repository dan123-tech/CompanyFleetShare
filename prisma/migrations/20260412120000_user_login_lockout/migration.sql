-- Brute-force account lockout after repeated failed password attempts (see src/lib/security/login-lockout.js).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginLockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginFailedAttempts" INTEGER NOT NULL DEFAULT 0;
