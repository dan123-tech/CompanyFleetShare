import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { put, BlobAccessError } from "@vercel/blob";
import { SELFIE_PRIVATE_PREFIX } from "@/lib/selfie-ref";
import { resolveBlobReadWriteToken, isEphemeralServerFilesystem } from "@/lib/blob-env";

function blobPutAccess() {
  const v = (process.env.BLOB_PUT_ACCESS || process.env.BLOB_ACCESS || "private").trim().toLowerCase();
  return v === "public" ? "public" : "private";
}

/**
 * @param {Buffer} buffer
 * @param {{ userId: string, ext: string, contentType: string }} meta
 * @returns {Promise<string>}
 */
export async function persistSelfieImage(buffer, { userId, ext, contentType }) {
  const basename = `${userId}-${Date.now()}${ext}`;
  const blobToken = resolveBlobReadWriteToken();
  const noDisk = isEphemeralServerFilesystem();

  if (noDisk && !blobToken) {
    throw new Error("MISSING_BLOB_TOKEN: This host has no writable upload folder. Configure BLOB_READ_WRITE_TOKEN and redeploy.");
  }

  if (blobToken) {
    const pathname = `selfies/${basename}`;
    const access = blobPutAccess();
    try {
      const blob = await put(pathname, buffer, {
        access,
        contentType: contentType || "image/jpeg",
        token: blobToken,
      });
      if (access === "private") return `${SELFIE_PRIVATE_PREFIX}${blob.pathname}`;
      return blob.url;
    } catch (e) {
      const accessDenied =
        e instanceof BlobAccessError ||
        e?.constructor?.name === "BlobAccessError" ||
        (typeof e?.message === "string" && e.message.includes("Access denied, please provide a valid token"));
      if (accessDenied) throw new Error("BLOB_ACCESS_MISMATCH: Upload was rejected (wrong store type or token mismatch).");
      throw new Error(`Vercel Blob upload failed (${e?.name || "Error"}): ${e?.message || String(e)}`);
    }
  }

  const dir = path.join(process.cwd(), "public", "uploads", "selfies");
  await mkdir(dir, { recursive: true });
  const filepath = path.join(dir, basename);
  await writeFile(filepath, buffer);
  return `/uploads/selfies/${basename}`;
}

