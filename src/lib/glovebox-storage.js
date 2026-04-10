import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { put, BlobAccessError } from "@vercel/blob";
import { randomUUID } from "crypto";
import { resolveBlobReadWriteToken, isEphemeralServerFilesystem } from "@/lib/blob-env";
import { DRIVING_LICENCE_PRIVATE_PREFIX } from "@/lib/driving-licence-ref";

/**
 * Same as driving-licence / selfie: default **private** Blob (typical Vercel store).
 * Set `BLOB_PUT_ACCESS=public` only if your Blob store is public-only.
 */
function gloveboxBlobPutAccess() {
  const v = (process.env.BLOB_PUT_ACCESS || process.env.BLOB_ACCESS || "private").trim().toLowerCase();
  return v === "public" ? "public" : "private";
}

/**
 * Store RCA / glovebox document (PDF or image). Blob: private pathname (`private:…`) or public URL,
 * matching BLOB_PUT_ACCESS. Local disk: `/uploads/glovebox/...`. Drivers and admins open files via
 * GET /api/cars/[id]/glovebox-document when the stored value is not a public URL.
 *
 * @param {Buffer} buffer
 * @param {{ companyId: string, carId: string, filename: string, contentType: string }} meta
 * @returns {Promise<string>} DB value: private:pathname, https URL, or /uploads/glovebox/...
 */
export async function persistGloveboxPublicDocument(buffer, { companyId, carId, filename, contentType }) {
  const safeName = String(filename || "rca.jpg").replace(/[^\w.\-() ]+/g, "_").slice(0, 120);
  const blobToken = resolveBlobReadWriteToken();
  const noDisk = isEphemeralServerFilesystem();

  if (noDisk && !blobToken) {
    throw new Error(
      "MISSING_BLOB_TOKEN: Glovebox uploads need Vercel Blob on this host. In Vercel: Project → Storage → Blob → connect store so BLOB_READ_WRITE_TOKEN is set, then redeploy. On Cloudflare Workers / OpenNext: set BLOB_READ_WRITE_TOKEN on the Worker (wrangler secret put BLOB_READ_WRITE_TOKEN); Vercel env vars alone are not available there."
    );
  }

  if (blobToken) {
    const pathname = `glovebox/${companyId}/${carId}/${randomUUID()}-${safeName}`;
    const access = gloveboxBlobPutAccess();
    try {
      const blob = await put(pathname, buffer, {
        access,
        contentType: contentType || "application/octet-stream",
        token: blobToken,
      });
      if (access === "private") {
        return `${DRIVING_LICENCE_PRIVATE_PREFIX}${blob.pathname}`;
      }
      return blob.url;
    } catch (e) {
      const accessDenied =
        e instanceof BlobAccessError ||
        e?.constructor?.name === "BlobAccessError" ||
        (typeof e?.message === "string" && e.message.includes("Access denied, please provide a valid token"));
      if (accessDenied) {
        throw new Error(
          access === "private"
            ? "BLOB_ACCESS_MISMATCH: Glovebox upload was rejected (wrong store type vs BLOB_PUT_ACCESS, or token mismatch). Default is private — use the same Vercel Blob store as driving-licence uploads, or set BLOB_PUT_ACCESS=public for a public-only store."
            : "BLOB_ACCESS_MISMATCH: Glovebox upload was rejected (often a private Blob store with BLOB_PUT_ACCESS=public). Set BLOB_PUT_ACCESS=private or use a public Blob store."
        );
      }
      throw new Error(`Vercel Blob upload failed (${e?.name || "Error"}): ${e?.message || String(e)}`);
    }
  }

  const dir = path.join(process.cwd(), "public", "uploads", "glovebox", companyId, carId);
  await mkdir(dir, { recursive: true });
  const basename = `${randomUUID()}-${safeName}`;
  const filepath = path.join(dir, basename);
  await writeFile(filepath, buffer);
  return `/uploads/glovebox/${companyId}/${carId}/${basename}`;
}
