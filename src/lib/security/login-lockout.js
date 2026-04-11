/**
 * Account lockout after repeated failed password attempts (control DB User).
 * Env: LOGIN_LOCKOUT_MAX_ATTEMPTS (default 5), LOGIN_LOCKOUT_MINUTES (default 15).
 */

import { prisma } from "@/lib/db";

function maxAttempts() {
  const n = parseInt(process.env.LOGIN_LOCKOUT_MAX_ATTEMPTS || "5", 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function lockoutMinutes() {
  const n = parseInt(process.env.LOGIN_LOCKOUT_MINUTES || "15", 10);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

/**
 * Structured server log for every failed login (password wrong, locked, etc.).
 * @param {{ reason: string, emailNorm: string, userId: string | null, ip: string, extra?: object }} p
 */
export function logLoginFailure(p) {
  const line = JSON.stringify({
    event: "login_failure",
    ts: new Date().toISOString(),
    reason: p.reason,
    emailNorm: p.emailNorm,
    userId: p.userId,
    ip: p.ip,
    ...p.extra,
  });
  console.warn(line);
}

/**
 * @param {{ loginLockedUntil: Date | null }} user
 * @returns {boolean}
 */
export function isUserLoginLocked(user) {
  if (!user?.loginLockedUntil) return false;
  return user.loginLockedUntil.getTime() > Date.now();
}

/**
 * @param {{ loginLockedUntil: Date | null }} user
 * @returns {number} seconds until unlock (at least 1)
 */
export function loginLockRetryAfterSec(user) {
  if (!user?.loginLockedUntil) return 60;
  return Math.max(1, Math.ceil((user.loginLockedUntil.getTime() - Date.now()) / 1000));
}

/**
 * Record a failed password attempt for an existing user; may set loginLockedUntil.
 * @param {string} userId
 * @param {string} emailNorm
 * @param {string} ip
 */
export async function recordPasswordLoginFailure(userId, emailNorm, ip) {
  const max = maxAttempts();
  const lockMs = lockoutMinutes() * 60 * 1000;
  const now = new Date();

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { loginFailedAttempts: true, loginLockedUntil: true },
  });
  const prev = row?.loginFailedAttempts ?? 0;
  const next = prev + 1;

  logLoginFailure({
    reason: "invalid_password",
    emailNorm,
    userId,
    ip,
    extra: { attempt: next, maxAttempts: max },
  });

  if (next >= max) {
    const lockedUntil = new Date(now.getTime() + lockMs);
    await prisma.user.update({
      where: { id: userId },
      data: {
        loginFailedAttempts: 0,
        loginLockedUntil: lockedUntil,
      },
    });
    logLoginFailure({
      reason: "account_locked",
      emailNorm,
      userId,
      ip,
      extra: { lockedUntil: lockedUntil.toISOString(), lockoutMinutes: lockoutMinutes() },
    });
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { loginFailedAttempts: next },
  });
}

/** Clear counters and lock after successful password login (MFA may still follow). */
export async function clearPasswordLoginFailures(userId) {
  await prisma.user.updateMany({
    where: { id: userId },
    data: {
      loginFailedAttempts: 0,
      loginLockedUntil: null,
    },
  });
}
