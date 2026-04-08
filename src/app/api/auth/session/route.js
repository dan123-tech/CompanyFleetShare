/**
 * GET /api/auth/session
 * Returns current user and company from session cookie.
 */

import { getSession } from "@/lib/auth";
import { normalizeClientType } from "@/lib/auth/session-tokens";
import { getCompanyById } from "@/lib/companies";
import { getUserById } from "@/lib/users";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";
import { drivingLicenceUrlForApi } from "@/lib/driving-licence-ref";
import { selfieUrlForApi } from "@/lib/selfie-ref";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStore(res) {
  res.headers.set("Cache-Control", "private, no-store, must-revalidate");
  return res;
}

export async function GET() {
  const session = await getSession();
  if (!session) return noStore(errorResponse("Unauthorized", 401));
  const userRow = await getUserById(session.userId);
  const baseUser = {
    id: session.userId,
    email: session.email,
    name: session.name,
    role: session.role ?? null,
    companyId: session.companyId ?? null,
    drivingLicenceStatus: userRow?.drivingLicenceStatus ?? null,
    drivingLicenceUrl: drivingLicenceUrlForApi(userRow?.drivingLicenceUrl, session.userId),
    selfieUrl: selfieUrlForApi(userRow?.selfieUrl, session.userId),
    identityStatus: userRow?.identityStatus ?? null,
    identityVerifiedAt: userRow?.identityVerifiedAt ?? null,
    identityVerifiedBy: userRow?.identityVerifiedBy ?? null,
    identityScore: userRow?.identityScore ?? null,
    identityReason: userRow?.identityReason ?? null,
    mfaEnabled: Boolean(userRow?.mfaEnabled),
    mustChangePassword: Boolean(userRow?.mustChangePassword),
    emailBookingNotifications: userRow?.emailBookingNotifications !== false,
    hasCalendarFeed: Boolean(userRow?.calendarFeedToken),
  };
  const webExtra =
    normalizeClientType(session.client) === "web" && session.sid ? { webSessionId: session.sid } : {};
  if (!session.companyId) {
    return noStore(jsonResponse({ user: baseUser, company: null, ...webExtra }));
  }
  const company = await getCompanyById(session.companyId);
  return noStore(jsonResponse({
    user: baseUser,
    company: company ? {
      id: company.id,
      name: company.name,
      domain: company.domain,
      joinCode: company.joinCode,
      defaultKmUsage: company.defaultKmUsage ?? 100,
      averageFuelPricePerLiter: company.averageFuelPricePerLiter ?? null,
      defaultConsumptionL100km: company.defaultConsumptionL100km ?? 7.5,
      priceBenzinePerLiter: company.priceBenzinePerLiter ?? null,
      priceDieselPerLiter: company.priceDieselPerLiter ?? null,
      priceHybridPerLiter: company.priceHybridPerLiter ?? null,
      priceElectricityPerKwh: company.priceElectricityPerKwh ?? null,
    } : null,
    ...webExtra,
  }));
}
