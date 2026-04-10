/**
 * RCA / glovebox document storage in DB vs URLs exposed to the browser.
 * Private Blob (default, same as driving licence) is not directly embeddable; we store
 * `private:pathname` and expose `/api/cars/:id/glovebox-document` (session + reservation/admin).
 */

import { DRIVING_LICENCE_PRIVATE_PREFIX } from "@/lib/driving-licence-ref";

const LOCAL_GLOVEBOX_PREFIX = "/uploads/glovebox/";

/** @param {string | null | undefined} stored */
export function rcaDocumentStoredNeedsProxy(stored) {
  if (stored == null || typeof stored !== "string" || !stored.trim()) return false;
  if (stored.startsWith(DRIVING_LICENCE_PRIVATE_PREFIX)) return true;
  if (stored.startsWith(LOCAL_GLOVEBOX_PREFIX)) return true;
  if (stored.includes(".private.blob.vercel-storage.com")) return true;
  return false;
}

/**
 * URL safe for <iframe> / <img> with cookies (same origin).
 * @param {string} carId
 * @param {string | null | undefined} stored
 */
export function rcaDocumentUrlForClient(carId, stored) {
  if (stored == null || typeof stored !== "string" || !stored.trim()) return null;
  if (rcaDocumentStoredNeedsProxy(stored)) {
    return `/api/cars/${encodeURIComponent(carId)}/glovebox-document`;
  }
  return stored;
}

/**
 * Ensure stored ref belongs to this car (path traversal / cross-car).
 * @param {string | null | undefined} stored
 * @param {string} companyId
 * @param {string} carId
 */
export function rcaStoredMatchesCar(stored, companyId, carId) {
  if (stored == null || typeof stored !== "string" || !stored.trim()) return false;
  if (stored.startsWith(LOCAL_GLOVEBOX_PREFIX)) {
    const prefix = `/uploads/glovebox/${companyId}/${carId}/`;
    return stored.startsWith(prefix);
  }
  if (stored.startsWith(DRIVING_LICENCE_PRIVATE_PREFIX)) {
    const pathname = stored.slice(DRIVING_LICENCE_PRIVATE_PREFIX.length);
    const segs = pathname.split("/").filter(Boolean);
    return segs[0] === "glovebox" && segs[1] === companyId && segs[2] === carId;
  }
  return true;
}
