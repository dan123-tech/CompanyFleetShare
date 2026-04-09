/**
 * Incident attachment storage values in DB vs URLs exposed to clients.
 */

export const INCIDENT_PRIVATE_PREFIX = "private-incident:";

export function incidentStoredNeedsProxy(stored) {
  if (stored == null || typeof stored !== "string" || !stored.trim()) return false;
  if (stored.startsWith(INCIDENT_PRIVATE_PREFIX)) return true;
  if (stored.startsWith("/uploads/incidents/")) return true;
  if (stored.includes("blob.vercel-storage.com")) return true;
  return false;
}

export function incidentAttachmentUrlForApi(stored, attachmentId) {
  if (stored == null || typeof stored !== "string" || !stored.trim()) return null;
  if (incidentStoredNeedsProxy(stored)) {
    return `/api/incidents/attachments/${encodeURIComponent(attachmentId)}`;
  }
  return stored;
}

