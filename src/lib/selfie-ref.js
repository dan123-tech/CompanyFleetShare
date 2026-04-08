/**
 * Selfie storage values in DB vs URLs exposed to clients.
 */

export const SELFIE_PRIVATE_PREFIX = "private-selfie:";

/**
 * @param {string | null | undefined} stored
 */
export function selfieStoredNeedsProxy(stored) {
  if (stored == null || typeof stored !== "string" || !stored.trim()) return false;
  if (stored.startsWith(SELFIE_PRIVATE_PREFIX)) return true;
  if (stored.startsWith("/uploads/selfies/")) return true;
  if (stored.includes("blob.vercel-storage.com")) return true;
  return false;
}

/**
 * @param {string | null | undefined} stored
 * @param {string} targetUserId
 * @returns {string | null}
 */
export function selfieUrlForApi(stored, targetUserId) {
  if (stored == null || typeof stored !== "string" || !stored.trim()) return null;
  if (selfieStoredNeedsProxy(stored)) {
    return `/api/users/${encodeURIComponent(targetUserId)}/selfie/image`;
  }
  return stored;
}

