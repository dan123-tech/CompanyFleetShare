/**
 * User and invite domain logic.
 * Handles user lookup, invite creation, and accepting invites (enrollment).
 */

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { randomBytes } from "crypto";
import { ensureTenantSchema, getTenantPrisma } from "@/lib/tenant-db";

/**
 * Find user by email (for login).
 * @param {string} email - User email
 * @returns {Promise<Object|null>} User with id, email, password, name or null
 */
export async function findUserByEmail(email) {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
}

/**
 * Create a new user and optionally attach to a company with ENROLLED status.
 * @param {Object} data - { email, password (plain), name }
 * @param {Object} [options] - optional { companyId, role, mustChangePassword } for enrollment / admin flows
 * @returns {Promise<Object>} Created user
 */
export async function createUser(data, options) {
  const email = data.email.toLowerCase().trim();
  const mustChangePassword = Boolean(options?.mustChangePassword);
  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });
    let nextUser = existing;
    if (!nextUser) {
      const hashed = await hashPassword(data.password);
      nextUser = await tx.user.create({
        data: {
          email,
          password: hashed,
          name: data.name.trim(),
          ...(mustChangePassword ? { mustChangePassword: true } : {}),
        },
      });
    } else if (!nextUser.name && data.name?.trim()) {
      nextUser = await tx.user.update({
        where: { id: nextUser.id },
        data: { name: data.name.trim() },
      });
    }

    if (options?.companyId) {
      const membershipInOtherCompany = await tx.companyMember.findFirst({
        where: {
          userId: nextUser.id,
          status: "ENROLLED",
          companyId: { not: options.companyId },
        },
        select: { companyId: true },
      });
      if (membershipInOtherCompany) {
        throw new Error("This email already belongs to another company.");
      }
      await tx.companyMember.upsert({
        where: { userId_companyId: { userId: nextUser.id, companyId: options.companyId } },
        update: { role: options.role, status: "ENROLLED" },
        create: {
          userId: nextUser.id,
          companyId: options.companyId,
          role: options.role,
          status: "ENROLLED",
        },
      });
    }
    return nextUser;
  });

  // Keep interactive transaction short; tenant sync runs after commit.
  if (options?.companyId) {
    await ensureTenantSchema(options.companyId);
    const tenant = await getTenantPrisma(options.companyId);
    await tenant.user.upsert({
      where: { id: user.id },
      update: { email: user.email, name: user.name, password: user.password },
      create: { id: user.id, email: user.email, name: user.name, password: user.password },
    });
    await tenant.companyMember.upsert({
      where: { userId_companyId: { userId: user.id, companyId: options.companyId } },
      update: { role: options.role, status: "ENROLLED" },
      create: {
        id: `${options.companyId}_${user.id}`,
        userId: user.id,
        companyId: options.companyId,
        role: options.role,
        status: "ENROLLED",
      },
    });
  }
  return user;
}

/**
 * Create an invite for an email to join a company. Creates a PENDING_INVITE member if not already present.
 * @param {string} companyId - Company id
 * @param {string} email - Invitee email
 * @param {string} role - Role: "ADMIN" or "USER"
 * @param {string} [name] - Optional display name
 * @returns {Promise<Object>} Invite with token
 */
export async function createInvite(companyId, email, role, name) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const emailNorm = email.toLowerCase().trim();

  const tenant = await getTenantPrisma(companyId);
  return tenant.$transaction(async (tx) => {
    const invite = await tx.invite.create({
      data: { token, email: emailNorm, companyId, expiresAt },
    });
    const existing = await tx.user.findUnique({ where: { email: emailNorm } });
    if (existing) {
      const membershipInOtherCompany = await tx.companyMember.findFirst({
        where: {
          userId: existing.id,
          status: "ENROLLED",
          companyId: { not: companyId },
        },
        select: { companyId: true },
      });
      if (membershipInOtherCompany) {
        throw new Error("This email already belongs to another company.");
      }
      const existingMember = await tx.companyMember.findUnique({
        where: { userId_companyId: { userId: existing.id, companyId } },
      });
      if (!existingMember) {
        await tx.companyMember.create({
          data: {
            userId: existing.id,
            companyId,
            role,
            status: "PENDING_INVITE",
          },
        });
      }
    }
    return invite;
  });
}

/**
 * Consume an invite token: mark invite as used and set member status to ENROLLED.
 * @param {string} token - Invite token from email/link
 * @param {string} userId - User id (after register or existing user)
 * @returns {Promise<Object|null>} Updated CompanyMember or null if token invalid/expired
 */
export async function acceptInvite(token, userId) {
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { company: true },
  });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) return null;

  await prisma.$transaction(async (tx) => {
    await tx.invite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });
    await tx.companyMember.upsert({
      where: {
        userId_companyId: { userId, companyId: invite.companyId },
      },
      create: {
        userId,
        companyId: invite.companyId,
        role: "USER",
        status: "ENROLLED",
      },
      update: { status: "ENROLLED" },
    });
  });

  return prisma.companyMember.findUnique({
    where: { userId_companyId: { userId, companyId: invite.companyId } },
    include: { company: true },
  });
}

/**
 * Get invite by token (for set-password or register page).
 * @param {string} token
 * @returns {Promise<Object|null>}
 */
export async function getInviteByToken(token) {
  return prisma.invite.findUnique({
    where: { token },
    include: { company: true },
  });
}

/**
 * List invites for a company (admin view: who was invited, joined or pending).
 * @param {string} companyId
 * @returns {Promise<Object[]>}
 */
export async function listInvites(companyId) {
  const tenant = await getTenantPrisma(companyId);
  return tenant.invite.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * List company members with user details (for admin Manage Users).
 * @param {string} companyId
 * @param {"ENROLLED"|"PENDING_INVITE"} [status]
 * @returns {Promise<Object[]>}
 */
export async function listCompanyMembers(companyId, status) {
  return prisma.companyMember.findMany({
    where: {
      companyId,
      ...(status ? { status } : {}),
      // Enforce one-company visibility: hide accidental cross-company memberships.
      user: {
        companyMembers: {
          none: {
            status: "ENROLLED",
            companyId: { not: companyId },
          },
        },
      },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          drivingLicenceUrl: true,
          drivingLicenceStatus: true,
          drivingLicenceVerifiedBy: true,
          selfieUrl: true,
          identityStatus: true,
          identityVerifiedAt: true,
          identityVerifiedBy: true,
          identityScore: true,
          identityReason: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Update a member's role (e.g. promote to ADMIN). Caller must ensure current user is admin.
 * @param {string} companyId
 * @param {string} userId
 * @param {string} role - "ADMIN" or "USER"
 */
export async function updateMemberRole(companyId, userId, role) {
  const updated = await prisma.companyMember.update({
    where: { userId_companyId: { userId, companyId } },
    data: { role },
  });
  try {
    const tenant = await getTenantPrisma(companyId);
    await tenant.companyMember.update({
      where: { userId_companyId: { userId, companyId } },
      data: { role },
    });
  } catch {
    // Control-plane write already succeeded; tenant sync will self-heal on next sync path.
  }
  return updated;
}

/**
 * Remove a user from the company (delete CompanyMember). Does not delete the User.
 * @param {string} companyId
 * @param {string} userId
 */
export async function removeMember(companyId, userId) {
  const deleted = await prisma.companyMember.delete({
    where: { userId_companyId: { userId, companyId } },
  });
  try {
    const tenant = await getTenantPrisma(companyId);
    await tenant.companyMember.deleteMany({
      where: { userId, companyId },
    });
  } catch {
    // Control-plane delete already succeeded; tenant sync will self-heal on next sync path.
  }
  return deleted;
}

/**
 * Update current user's driving licence (upload: set URL and status PENDING).
 * @param {string} userId
 * @param {{ drivingLicenceUrl: string }}
 */
export async function setUserDrivingLicenceUrl(userId, { drivingLicenceUrl }) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      drivingLicenceUrl,
      drivingLicenceStatus: "PENDING",
      drivingLicenceVerifiedBy: null,
      identityStatus: "UNVERIFIED",
      identityVerifiedAt: null,
      identityVerifiedBy: null,
      identityScore: null,
      identityReason: null,
    },
  });
}

/**
 * Update user's driving licence status (admin: APPROVED or REJECTED).
 * @param {string} userId
 * @param {"APPROVED"|"REJECTED"} status
 */
export async function setUserDrivingLicenceStatus(userId, status, options = {}) {
  const data = { drivingLicenceStatus: status };
  if (options.verifiedBy) data.drivingLicenceVerifiedBy = options.verifiedBy;
  return prisma.user.update({
    where: { id: userId },
    data,
  });
}

/**
 * Clear current user's driving licence (remove photo and status).
 * @param {string} userId
 */
export async function clearUserDrivingLicence(userId) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      drivingLicenceUrl: null,
      drivingLicenceStatus: null,
      drivingLicenceVerifiedBy: null,
      identityStatus: null,
      identityVerifiedAt: null,
      identityVerifiedBy: null,
      identityScore: null,
      identityReason: null,
    },
  });
}

/**
 * Update current user's selfie (upload: set URL and status PENDING).
 * @param {string} userId
 * @param {{ selfieUrl: string }}
 */
export async function setUserSelfieUrl(userId, { selfieUrl }) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      selfieUrl,
      identityStatus: "PENDING",
      identityVerifiedAt: null,
      identityVerifiedBy: null,
      identityScore: null,
      identityReason: null,
    },
  });
}

/**
 * Update user's identity verification status.
 * @param {string} userId
 * @param {"UNVERIFIED"|"PENDING"|"VERIFIED"|"REJECTED"|"PENDING_REVIEW"} identityStatus
 * @param {{ verifiedBy?: string, score?: number|null, reason?: string|null }} options
 */
export async function setUserIdentityStatus(userId, identityStatus, options = {}) {
  const isFinal = identityStatus === "VERIFIED" || identityStatus === "REJECTED";
  return prisma.user.update({
    where: { id: userId },
    data: {
      identityStatus,
      identityVerifiedAt: isFinal ? new Date() : null,
      identityVerifiedBy: options.verifiedBy ?? null,
      identityScore: typeof options.score === "number" ? options.score : null,
      identityReason: options.reason ?? null,
    },
  });
}

/**
 * Clear current user's selfie and identity status.
 * @param {string} userId
 */
export async function clearUserSelfie(userId) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      selfieUrl: null,
      identityStatus: null,
      identityVerifiedAt: null,
      identityVerifiedBy: null,
      identityScore: null,
      identityReason: null,
    },
  });
}

/**
 * Save or clear FCM device token for booking reminder pushes (mobile).
 * @param {string} userId
 * @param {string|null|undefined} token - null/empty clears
 */
export async function setUserFcmToken(userId, token) {
  const trimmed = typeof token === "string" ? token.trim() : "";
  if (!trimmed) {
    return prisma.user.update({
      where: { id: userId },
      data: { fcmToken: null, fcmTokenUpdatedAt: null },
    });
  }
  return prisma.user.update({
    where: { id: userId },
    data: { fcmToken: trimmed, fcmTokenUpdatedAt: new Date() },
  });
}

/**
 * Get user by id (for session with DL status).
 */
export async function getUserById(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      drivingLicenceStatus: true,
      drivingLicenceUrl: true,
      selfieUrl: true,
      identityStatus: true,
      identityVerifiedAt: true,
      identityVerifiedBy: true,
      identityScore: true,
      identityReason: true,
      mfaEnabled: true,
      mustChangePassword: true,
      emailBookingNotifications: true,
      calendarFeedToken: true,
    },
  });
}

/** Ensure user has a secret token for ICS subscription URL. */
export async function ensureCalendarFeedToken(userId) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { calendarFeedToken: true },
  });
  if (u?.calendarFeedToken) return u.calendarFeedToken;
  const token = randomBytes(32).toString("hex");
  await prisma.user.update({ where: { id: userId }, data: { calendarFeedToken: token } });
  return token;
}

/** Invalidate old subscription URLs (new token). */
export async function rotateCalendarFeedToken(userId) {
  const token = randomBytes(32).toString("hex");
  await prisma.user.update({ where: { id: userId }, data: { calendarFeedToken: token } });
  return token;
}

export async function clearCalendarFeedToken(userId) {
  await prisma.user.update({ where: { id: userId }, data: { calendarFeedToken: null } });
}

export async function findUserByCalendarFeedToken(token) {
  if (!token || typeof token !== "string") return null;
  return prisma.user.findUnique({
    where: { calendarFeedToken: token },
    select: { id: true, email: true, name: true },
  });
}

export async function updateUserEmailBookingNotifications(userId, enabled) {
  return prisma.user.update({
    where: { id: userId },
    data: { emailBookingNotifications: Boolean(enabled) },
    select: { emailBookingNotifications: true },
  });
}
