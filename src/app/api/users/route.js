/**
 * GET /api/users – list company members. Layer: LOCAL (Prisma), FIREBASE, SQL_SERVER (with table), or 503.
 * POST /api/users – (admin) create user. LOCAL: create user + add to company. SQL_SERVER: insert into Users table.
 */

import { z } from "zod";
import { listCompanyMembers, createUser } from "@/lib/users";
import { getProvider, getLayerTable, getStoredCredentials, LAYERS, PROVIDERS } from "@/lib/data-source-manager";
import { requireCompany, requireAdmin, jsonResponse, errorResponse, dataSourceNotConfiguredResponse } from "@/lib/api-helpers";
import { listFirebaseUsers, isFirebaseConfigured } from "@/lib/connectors/firebase-users";
import { listSqlServerUsers, createSqlServerUser } from "@/lib/connectors/sql-server-users";
import { drivingLicenceUrlForApi } from "@/lib/driving-licence-ref";
import { selfieUrlForApi } from "@/lib/selfie-ref";
import { sendAdminCreatedAccountEmail } from "@/lib/email";

export const runtime = "nodejs";

const postSchema = z.object({
  email: z.string().email().min(1).max(255),
  name: z.string().min(1).max(255),
  password: z.string().min(6).max(255).optional(), // optional for SQL Server if no auth
  role: z.enum(["ADMIN", "USER"]).optional().default("USER"),
});

export async function GET(request) {
  try {
    const out = await requireCompany();
    if ("response" in out) return out.response;
    let provider;
    try {
      provider = await getProvider(out.session.companyId, LAYERS.USERS);
    } catch (err) {
      console.error("GET /api/users (data source) error:", err);
      return errorResponse(err?.message || "Failed to load users", 500);
    }

    if (provider === PROVIDERS.SQL_SERVER) {
      const tableName = (await getLayerTable(out.session.companyId, LAYERS.USERS)) || "Users";
      try {
        const users = await listSqlServerUsers(out.session.companyId, tableName);
        if (users == null) {
          return dataSourceNotConfiguredResponse(LAYERS.USERS, "SQL Server credentials not saved. Connect again in Database Settings.");
        }
        return jsonResponse(
          users.map((u) => ({
            ...u,
            drivingLicenceUrl: drivingLicenceUrlForApi(u.drivingLicenceUrl, u.userId),
            selfieUrl: selfieUrlForApi(u.selfieUrl, u.userId),
          }))
        );
      } catch (err) {
        console.error("GET /api/users (SQL Server) error:", err);
        const msg = err?.message || String(err) || "Failed to load users from SQL Server";
        return dataSourceNotConfiguredResponse(LAYERS.USERS, msg);
      }
    }

    if (provider === PROVIDERS.FIREBASE) {
      const storedCreds = await getStoredCredentials(out.session.companyId, LAYERS.USERS, PROVIDERS.FIREBASE);
      const hasStoredCreds = storedCreds?.serviceAccountJson && String(storedCreds.serviceAccountJson).trim();
      if (!hasStoredCreds && !isFirebaseConfigured()) {
        return dataSourceNotConfiguredResponse(
          LAYERS.USERS,
          "Firebase needs credentials. In Database Settings → Users → Firebase, paste the Service account JSON (Firebase Console → Service accounts → Generate new private key), then Connect and Save Configuration."
        );
      }
      try {
        const users = await listFirebaseUsers(hasStoredCreds ? storedCreds : null, out.session.companyId);
        return jsonResponse(users);
      } catch (err) {
        console.error("GET /api/users (Firebase) error:", err);
        const msg = err?.message || String(err) || "Failed to load users from Firebase";
        return dataSourceNotConfiguredResponse(LAYERS.USERS, msg);
      }
    }

    if (provider !== PROVIDERS.LOCAL) {
      return dataSourceNotConfiguredResponse(LAYERS.USERS);
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    let members;
    try {
      members = await listCompanyMembers(out.session.companyId, status || undefined);
    } catch (localErr) {
      console.error("GET /api/users (LOCAL) error:", localErr);
      const msg = localErr?.message || String(localErr) || "Failed to load users from database";
      return errorResponse(msg, 500);
    }
    return jsonResponse(
      members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
        status: m.status,
        drivingLicenceUrl: drivingLicenceUrlForApi(m.user.drivingLicenceUrl, m.userId),
        drivingLicenceStatus: m.user.drivingLicenceStatus,
        drivingLicenceVerifiedBy: m.user.drivingLicenceVerifiedBy || null,
        selfieUrl: selfieUrlForApi(m.user.selfieUrl, m.userId),
        identityStatus: m.user.identityStatus || null,
        identityVerifiedAt: m.user.identityVerifiedAt || null,
        identityVerifiedBy: m.user.identityVerifiedBy || null,
        identityScore: m.user.identityScore ?? null,
        identityReason: m.user.identityReason || null,
        createdAt: m.createdAt,
      }))
    );
  } catch (err) {
    console.error("GET /api/users error:", err);
    const msg = err?.message || err?.toString?.() || "Failed to load users";
    return errorResponse(msg, 500);
  }
}

export async function POST(request) {
  const out = await requireAdmin();
  if ("response" in out) return out.response;
  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("Invalid input", 422);
  const data = parsed.data;

  try {
    const provider = await getProvider(out.session.companyId, LAYERS.USERS);
    if (provider === PROVIDERS.SQL_SERVER) {
      const tableName = await getLayerTable(out.session.companyId, LAYERS.USERS);
      if (!tableName) return dataSourceNotConfiguredResponse(LAYERS.USERS, "Select a data table in Database Settings for the Users layer.");
      const creds = await getStoredCredentials(out.session.companyId, LAYERS.USERS, PROVIDERS.SQL_SERVER);
      if (!creds?.host || !creds?.username || !creds?.password) {
        return dataSourceNotConfiguredResponse(LAYERS.USERS, "SQL Server credentials not saved. Connect again in Database Settings.");
      }
      const { hashPassword } = await import("@/lib/auth");
      const passwordHash = data.password ? await hashPassword(data.password) : null;
      const user = await createSqlServerUser(out.session.companyId, {
        email: data.email,
        name: data.name,
        passwordHash,
        role: data.role,
        status: "enrolled",
        active: true,
      });
      if (!user) return errorResponse("Could not create user in SQL Server", 500);
      return jsonResponse(
        { id: user.id, userId: user.userId ?? user.id, email: user.email, name: user.name, role: user.role, status: user.status },
        201
      );
    }
    if (provider !== PROVIDERS.LOCAL) return dataSourceNotConfiguredResponse(LAYERS.USERS);
  } catch (err) {
    console.error("POST /api/users error:", err);
    return errorResponse(err?.message || "Failed to create user", 500);
  }

  const user = await createUser(
    { email: data.email, name: data.name, password: data.password || "ChangeMe123!" },
    { companyId: out.session.companyId, role: data.role, mustChangePassword: true }
  );
  const member = await listCompanyMembers(out.session.companyId).then((m) => m.find((x) => x.userId === user.id));

  let provisionEmailSent = false;
  try {
    const mail = await sendAdminCreatedAccountEmail({ to: user.email, name: user.name });
    provisionEmailSent = mail.ok === true;
    if (!mail.ok && mail.error !== "not_configured") {
      console.error("[POST /api/users] provision email:", mail.error);
    }
  } catch (e) {
    console.error("[POST /api/users] provision email exception:", e);
  }

  return jsonResponse(
    {
      id: member?.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      role: member?.role ?? data.role,
      status: member?.status ?? "ENROLLED",
      mustChangePassword: true,
      provisionEmailSent,
    },
    201
  );
}
