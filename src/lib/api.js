/**
 * Client-side API helpers. All requests use credentials: 'include' for session cookie.
 * Web: per-tab session id in sessionStorage + X-Web-Session-Id so a second browser tab login
 * does not keep the first tab authenticated (shared cookie alone cannot distinguish tabs).
 */

export const WEB_TAB_SESSION_STORAGE_KEY = "car_sharing_web_tab_sid";

function getWebTabSidHeaders() {
  if (typeof window === "undefined") return {};
  try {
    const tabSid = sessionStorage.getItem(WEB_TAB_SESSION_STORAGE_KEY);
    if (tabSid) return { "X-Web-Session-Id": tabSid };
  } catch (_) {}
  return {};
}

export function persistWebTabSessionId(sid) {
  if (typeof window === "undefined" || typeof sid !== "string" || !sid) return;
  try {
    sessionStorage.setItem(WEB_TAB_SESSION_STORAGE_KEY, sid);
  } catch (_) {}
}

export function clearWebTabSessionId() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(WEB_TAB_SESSION_STORAGE_KEY);
  } catch (_) {}
}

export const WEB_AUTH_BROADCAST = "car_sharing_web_auth";
/** Dispatched on 401 (except login/register) so the dashboard can redirect without a manual refresh. */
export const WEB_SESSION_LOST_EVENT = "car-sharing:session-lost";

/** Tell other tabs their web tab session is no longer valid (same browser logged in again). */
export function notifyOtherWebTabsNewSession(sid) {
  if (typeof window === "undefined" || typeof sid !== "string" || !sid) return;
  try {
    const bc = new BroadcastChannel(WEB_AUTH_BROADCAST);
    bc.postMessage({ type: "web_session_replaced", sid });
    bc.close();
  } catch (_) {}
}

function persistWebSessionFromResponse(data, { broadcastReplacement = false } = {}) {
  if (data && typeof data.webSessionId === "string" && data.webSessionId) {
    persistWebTabSessionId(data.webSessionId);
    if (broadcastReplacement) notifyOtherWebTabsNewSession(data.webSessionId);
  }
}

const getOpts = (method = "GET", body) => {
  // Avoid stale HTTP cache (especially for /api/auth/session) causing false 401 after login.
  const opts = { method, credentials: "include", cache: "no-store", headers: { ...getWebTabSidHeaders() } };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  return opts;
};

function throwIfDataSourceNotConfigured(res, data) {
  if (res.status === 503 && data?.code === "DATA_SOURCE_NOT_CONFIGURED") {
    const err = new Error(data.error || "Data source not configured for this layer.");
    err.code = data.code;
    err.layer = data.layer;
    throw err;
  }
}

export async function apiDataSourceConfigGet() {
  const res = await fetch("/api/companies/current/data-source-config", getOpts("GET"));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load data source config");
  return data;
}

export async function apiLogin(email, password) {
  const res = await fetch("/api/auth/login", getOpts("POST", { email, password, clientType: "web" }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Login failed");
  if (data.mfaRequired) {
    return { mfaRequired: true, email: data.email || email };
  }
  persistWebSessionFromResponse(data);
  return { mfaRequired: false, ...data };
}

export async function apiVerifyMfaLogin(email, code) {
  const res = await fetch(
    "/api/auth/mfa-verify",
    getOpts("POST", { email, code, clientType: "web" })
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Verification failed");
  persistWebSessionFromResponse(data);
  return data;
}

export async function apiUserMfaUpdate(enabled, password) {
  const res = await fetch("/api/users/me/mfa", getOpts("PATCH", { enabled, password }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not update security settings");
  return data;
}

export async function apiLogout() {
  try {
    await fetch("/api/auth/logout", getOpts("POST"));
  } finally {
    clearWebTabSessionId();
  }
}

export async function apiRegister(email, password, name) {
  const res = await fetch("/api/auth/register", getOpts("POST", { email, password, name }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Registration failed");
  return data;
}

/** Change password for the current session; clears mustChangePassword when applicable. */
export async function apiChangePassword(currentPassword, newPassword) {
  const res = await fetch(
    "/api/users/me/password",
    getOpts("PATCH", { currentPassword, newPassword })
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Failed to change password");
  }
  return data;
}

export async function apiUserEmailNotifications(enabled) {
  const res = await fetch("/api/users/me/notifications", getOpts("PATCH", { emailBookingNotifications: enabled }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to update notification settings");
  return data;
}

export async function apiUserCalendarFeedUrl() {
  const res = await fetch("/api/users/me/calendar-feed", getOpts("GET"));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load calendar feed URL");
  return data;
}

export async function apiUserCalendarFeedRotate() {
  const res = await fetch("/api/users/me/calendar-feed", getOpts("POST"));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to rotate calendar token");
  return data;
}

export async function apiUserCalendarFeedDisable() {
  const res = await fetch("/api/users/me/calendar-feed", getOpts("DELETE"));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to disable calendar feed");
  return data;
}

export async function apiMaintenanceList(carId) {
  const q = carId ? `?carId=${encodeURIComponent(carId)}` : "";
  const res = await fetch(`/api/maintenance${q}`, getOpts("GET"));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load maintenance");
  return data;
}

export async function apiMaintenanceCreate(payload) {
  const res = await fetch("/api/maintenance", getOpts("POST", payload));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to add maintenance");
  return data;
}

export async function apiMaintenanceDelete(id) {
  const res = await fetch(`/api/maintenance/${encodeURIComponent(id)}`, getOpts("DELETE"));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to delete");
  return data;
}

export async function apiSession() {
  const res = await fetch("/api/auth/session", getOpts("GET"));
  if (res.status === 401) {
    clearWebTabSessionId();
    return null;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Session failed");
  persistWebSessionFromResponse(data);
  return data;
}

export async function apiCreateCompany(name, domain) {
  const res = await fetch("/api/companies", getOpts("POST", { name, domain: domain || null }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Create company failed");
  persistWebSessionFromResponse(data, { broadcastReplacement: true });
  return data;
}

export async function apiJoinCompany(joinCode) {
  const res = await fetch("/api/companies/join", getOpts("POST", { joinCode }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Join failed");
  persistWebSessionFromResponse(data, { broadcastReplacement: true });
  return data;
}

export async function apiCompaniesCurrent() {
  const res = await fetch("/api/companies/current", getOpts("GET"));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load company");
  return data;
}

export async function apiUpdateCompanyCurrent(payload) {
  const res = await fetch("/api/companies/current", getOpts("PATCH", payload));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to update company");
  return data;
}

export async function apiCars(status) {
  const url = status ? `/api/cars?status=${encodeURIComponent(status)}` : "/api/cars";
  const res = await fetch(url, getOpts("GET"));
  const data = await res.json().catch(() => ({}));
  throwIfDataSourceNotConfigured(res, data);
  if (!res.ok) {
    const err = new Error(typeof data?.error === "string" ? data.error : "Failed to load cars");
    if (data?.code) err.code = data.code;
    if (data?.layer) err.layer = data.layer;
    throw err;
  }
  return data;
}

/** Latest car row (odometer etc.) for release / validation. */
export async function apiGetCar(id) {
  const res = await fetch(`/api/cars/${encodeURIComponent(id)}`, getOpts("GET"));
  const data = await res.json().catch(() => ({}));
  throwIfDataSourceNotConfigured(res, data);
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to load car");
  return data;
}

export async function apiAddCar(payload) {
  const res = await fetch("/api/cars", getOpts("POST", payload));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to add car");
  return data;
}

export async function apiUpdateCar(id, payload) {
  const res = await fetch(`/api/cars/${id}`, getOpts("PATCH", payload));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to update car");
  return data;
}

export async function apiDeleteCar(id) {
  const res = await fetch(`/api/cars/${id}`, getOpts("DELETE"));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to delete car");
  return data;
}

export async function apiUsers(status) {
  const url = status ? `/api/users?status=${encodeURIComponent(status)}` : "/api/users";
  const res = await fetch(url, getOpts("GET"));
  const data = await res.json().catch(() => ({}));
  throwIfDataSourceNotConfigured(res, data);
  if (!res.ok) {
    const err = new Error(typeof data?.error === "string" ? data.error : "Failed to load users");
    if (data?.code) err.code = data.code;
    if (data?.layer) err.layer = data.layer;
    throw err;
  }
  return data;
}

export async function apiInviteUser(email, name, role) {
  const res = await fetch("/api/users/invite", getOpts("POST", { email, name, role }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to invite");
  return data;
}

/** Create user directly (admin). POST /api/users. For LOCAL adds to company; for SQL Server inserts into Users table. */
export async function apiCreateUser(email, name, password, role) {
  const res = await fetch("/api/users", getOpts("POST", { email, name, password: password || undefined, role: role || "USER" }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to create user");
  return data;
}

export async function apiUpdateUserRole(userId, role) {
  const res = await fetch(`/api/users/${userId}`, getOpts("PATCH", { role }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to update user");
  return data;
}

/** Upload driving licence image (File). */
export async function apiUploadDrivingLicence(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/users/me/driving-licence", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { ...getWebTabSidHeaders() },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data;
}

/** Delete current user's driving licence (remove photo and status). */
export async function apiDeleteDrivingLicence() {
  const res = await fetch("/api/users/me/driving-licence", {
    method: "DELETE",
    credentials: "include",
    cache: "no-store",
    headers: { ...getWebTabSidHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Delete failed");
  return data;
}

/** Admin: set user driving licence status. */
export async function apiSetUserDrivingLicenceStatus(userId, drivingLicenceStatus) {
  const res = await fetch(`/api/users/${userId}`, getOpts("PATCH", { drivingLicenceStatus }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to update");
  return data;
}

export async function apiRemoveUser(userId) {
  const res = await fetch(`/api/users/${userId}`, getOpts("DELETE"));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to remove user");
  return data;
}

/**
 * @param {string | { status?: string; mine?: boolean } | undefined} statusOrOpts
 * Pass `{ mine: true }` on the user dashboard so admins only see their own bookings.
 * Legacy: a string sets the `status` query param only.
 */
export async function apiReservations(statusOrOpts) {
  const params = new URLSearchParams();
  let status;
  let mine = false;
  if (typeof statusOrOpts === "string") {
    status = statusOrOpts;
  } else if (statusOrOpts && typeof statusOrOpts === "object") {
    status = statusOrOpts.status;
    mine = !!statusOrOpts.mine;
  }
  if (status) params.set("status", status);
  if (mine) params.set("mine", "1");
  const q = params.toString();
  const url = q ? `/api/reservations?${q}` : "/api/reservations";
  const res = await fetch(url, getOpts("GET"));
  const data = await res.json().catch(() => ({}));
  throwIfDataSourceNotConfigured(res, data);
  if (!res.ok) {
    const err = new Error(typeof data?.error === "string" ? data.error : "Failed to load reservations");
    if (data?.code) err.code = data.code;
    if (data?.layer) err.layer = data.layer;
    throw err;
  }
  return data;
}

export async function apiReservationHistory() {
  const res = await fetch("/api/reservations/history", getOpts("GET"));
  const data = await res.json().catch(() => ({}));
  throwIfDataSourceNotConfigured(res, data);
  if (!res.ok) throw new Error(data.error || "Failed to load history");
  return data;
}

/** Create a reservation. Omit startDate/endDate for instant (until released). Use ISO 8601 for startDate/endDate to book in advance. */
export async function apiCreateReservation(carId, purpose, startDate, endDate) {
  const body = { carId, purpose: purpose || null };
  if (startDate != null) body.startDate = typeof startDate === "string" ? startDate : startDate?.toISOString?.();
  if (endDate != null) body.endDate = typeof endDate === "string" ? endDate : endDate?.toISOString?.();
  const res = await fetch("/api/reservations", getOpts("POST", body));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to create reservation");
  return data;
}

/** Verify pickup code (30-min window). Admin can pass bypass: true to skip time check. */
export async function apiVerifyPickupCode(pickup_code, bypass) {
  const res = await fetch("/api/reservations/verify-pickup-code", getOpts("POST", { pickup_code: String(pickup_code).trim(), bypass: !!bypass }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Verification failed");
  return data;
}

export async function apiCancelReservation(id) {
  const res = await fetch(`/api/reservations/${id}`, getOpts("PATCH", { action: "cancel" }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to cancel");
  return data;
}

export async function apiReleaseReservation(id, newKm, exceededReason) {
  const km = typeof newKm === "number" ? newKm : parseInt(String(newKm), 10);
  if (isNaN(km) || km < 0) throw new Error("Invalid new km");
  const body = { action: "release", newKm: km };
  if (exceededReason != null && String(exceededReason).trim()) body.exceededReason = String(exceededReason).trim();
  const res = await fetch(`/api/reservations/${id}`, getOpts("PATCH", body));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to release");
  return data;
}

export async function apiInvites() {
  const res = await fetch("/api/invites", getOpts("GET"));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load invites");
  return data;
}

export async function apiExtendReservation(id, endDate) {
  const res = await fetch(`/api/reservations/${id}`, getOpts("PATCH", { action: "extend", endDate }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to extend");
  return data;
}

/** Admin: list reservations with pending km-exceeded approval. */
export async function apiPendingExceededApprovals() {
  const res = await fetch("/api/reservations/pending-approvals", getOpts("GET"));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load");
  return data;
}

/** Admin: approve or reject exceeded km reason (observations visible to user). */
export async function apiSetExceededApproval(reservationId, action, observations) {
  const body = { action };
  if (observations != null && String(observations).trim()) body.observations = String(observations).trim();
  const res = await fetch(`/api/reservations/${reservationId}`, getOpts("PATCH", body));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to update");
  return data;
}

/** Admin: refresh pickup and release codes for an active reservation. */
export async function apiRefreshReservationCodes(reservationId) {
  const res = await fetch(`/api/reservations/${reservationId}`, getOpts("PATCH", { action: "refreshCodes" }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to refresh codes");
  return data;
}

/**
 * Admin: list audit logs for the company.
 * @param {{ page?: number, limit?: number, action?: string, entityType?: string }} opts
 */
export async function apiAuditLogs({ page = 1, limit = 50, action, entityType } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (action) params.set("action", action);
  if (entityType) params.set("entityType", entityType);
  const res = await fetch(`/api/audit-logs?${params}`, getOpts("GET"));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load audit logs");
  return data;
}

/**
 * Any 401 from /api (except login/register) clears the tab session and notifies the UI — no full page refresh needed.
 */
function installFetch401Interceptor() {
  if (typeof window === "undefined" || window.__carSharingFetch401) return;
  window.__carSharingFetch401 = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await nativeFetch(input, init);
    if (res.status !== 401) return res;
    let path = "";
    try {
      if (typeof input === "string") path = input.split("?")[0] || input;
      else if (input && typeof input.url === "string") {
        path = new URL(input.url, window.location.origin).pathname;
      }
    } catch (_) {}
    if (
      path.startsWith("/api") &&
      !path.includes("/api/auth/login") &&
      !path.includes("/api/auth/register")
    ) {
      clearWebTabSessionId();
      window.dispatchEvent(new CustomEvent(WEB_SESSION_LOST_EVENT));
    }
    return res;
  };
}

installFetch401Interceptor();
