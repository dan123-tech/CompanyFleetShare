import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { put, BlobAccessError } from "@vercel/blob";
import { INCIDENT_PRIVATE_PREFIX } from "@/lib/incident-ref";
import { resolveBlobReadWriteToken, isEphemeralServerFilesystem } from "@/lib/blob-env";

function blobPutAccess() {
  const v = (process.env.BLOB_PUT_ACCESS || process.env.BLOB_ACCESS || "private").trim().toLowerCase();
  return v === "public" ? "public" : "private";
}

/**
 * @param {Buffer} buffer
 * @param {{ incidentId: string, filename: string, contentType: string }} meta
 * @returns {Promise<string>} stored DB value (private prefix or local path)
 */
export async function persistIncidentAttachment(buffer, { incidentId, filename, contentType }) {
  const safeName = String(filename || "file").replace(/[^\w.\-() ]+/g, "_").slice(0, 180);
  const basename = `${Date.now()}-${safeName}`;
  const blobToken = resolveBlobReadWriteToken();
  const noDisk = isEphemeralServerFilesystem();

  if (noDisk && !blobToken) {
    throw new Error("MISSING_BLOB_TOKEN: Configure BLOB_READ_WRITE_TOKEN for uploads on this host.");
  }

  if (blobToken) {
    const pathname = `incidents/${incidentId}/${basename}`;
    const access = blobPutAccess();
    try {
      const blob = await put(pathname, buffer, {
        access,
        contentType: contentType || "application/octet-stream",
        token: blobToken,
      });
      if (access === "private") return `${INCIDENT_PRIVATE_PREFIX}${blob.pathname}`;
      return blob.url;
    } catch (e) {
      const accessDenied =
        e instanceof BlobAccessError ||
        e?.constructor?.name === "BlobAccessError" ||
        (typeof e?.message === "string" && e.message.includes("Access denied, please provide a valid token"));
      if (accessDenied) throw new Error("BLOB_ACCESS_MISMATCH: Incident upload was rejected (token/store mismatch).");
      throw new Error(`Vercel Blob upload failed (${e?.name || "Error"}): ${e?.message || String(e)}`);
    }
  }

  const dir = path.join(process.cwd(), "public", "uploads", "incidents", incidentId);
  await mkdir(dir, { recursive: true });
  const filepath = path.join(dir, basename);
  await writeFile(filepath, buffer);
  return `/uploads/incidents/${encodeURIComponent(incidentId)}/${encodeURIComponent(basename)}`;
}

