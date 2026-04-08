/**
 * POST /api/users/me/driving-licence – upload driving licence photo and send to AI for verification
 *
 * On Vercel, local disk under public/ is not writable; set BLOB_READ_WRITE_TOKEN (Vercel Blob).
 */

import { jsonResponse, errorResponse } from "@/lib/api-helpers";
import { getSession } from "@/lib/auth";
import { setUserDrivingLicenceUrl, setUserDrivingLicenceStatus, clearUserDrivingLicence } from "@/lib/users";
import { verifyDrivingLicenceWithAI } from "@/lib/ai-verification";
import { persistDrivingLicenceImage } from "@/lib/driving-licence-storage";
import { drivingLicenceUrlForApi } from "@/lib/driving-licence-ref";
import { resolveBlobReadWriteToken, isEphemeralServerFilesystem } from "@/lib/blob-env";
import { getCompanyById } from "@/lib/companies";
import { getAiValidationSettings } from "@/lib/ai-validation-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel serverless request bodies are capped (~4.5 MB); stay under that so the route is reached. */
export const maxDuration = 60;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** Keep below Vercel’s ~4.5 MB body limit or the request fails before this handler runs (opaque 5xx). */
const MAX_SIZE = 4 * 1024 * 1024; // 4 MB

/**
 * Infer image/* from first bytes when browsers send octet-stream or empty type (common on mobile).
 * @param {Buffer} buf
 * @returns {string | null}
 */
function sniffImageMimeFromBuffer(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Many phones send empty type or application/octet-stream; infer from extension or file bytes.
 * @param {File} file
 * @param {Buffer} buffer
 * @returns {{ typ: string, ext: string } | { error: string }}
 */
function resolveLicenceImageMeta(file, buffer) {
  let typ = (file.type || "").toLowerCase().trim();
  const name = (file.name || "").toLowerCase();
  if (!typ || typ === "application/octet-stream") {
    if (name.endsWith(".webp")) typ = "image/webp";
    else if (name.endsWith(".png")) typ = "image/png";
    else if (name.endsWith(".jpg") || name.endsWith(".jpeg")) typ = "image/jpeg";
    else {
      const sniffed = sniffImageMimeFromBuffer(buffer);
      if (sniffed) typ = sniffed;
    }
  }
  if (typ === "image/jpg") typ = "image/jpeg";
  if (!ALLOWED_TYPES.includes(typ)) {
    return { error: "Only JPEG, PNG or WebP images allowed (or use a clear photo file)." };
  }
  const ext = typ === "image/png" ? ".png" : typ === "image/webp" ? ".webp" : ".jpg";
  return { typ, ext };
}

/**
 * @param {File} file
 * @returns {Promise<Buffer>}
 */
async function fileToBuffer(file) {
  try {
    return Buffer.from(await file.arrayBuffer());
  } catch (first) {
    if (typeof file.stream !== "function") throw first;
    const reader = file.stream().getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
}

export async function POST(request) {
  try {
    let session;
    try {
      session = await getSession();
    } catch (sessionErr) {
      console.error("[driving-licence] getSession threw:", sessionErr);
      return errorResponse(
        "Could not verify your session (database error). Try again in a moment or sign out and back in.",
        503
      );
    }
    if (!session?.userId) {
      return errorResponse("Unauthorized", 401);
    }

    let formData;
    try {
      formData = await request.formData();
    } catch (formErr) {
      console.error("[driving-licence] formData parse failed:", formErr);
      return errorResponse(
        "Could not read the upload. On Vercel, keep images under about 4 MB. If it keeps failing, try a smaller JPEG.",
        413
      );
    }
    const file = formData.get("file");
    if (!file || typeof file === "string") return errorResponse("Missing or invalid file", 422);
    if (file.size > MAX_SIZE) {
      return errorResponse(`File too large (max ${MAX_SIZE / (1024 * 1024)} MB on this host).`, 422);
    }
    let buffer;
    try {
      buffer = await fileToBuffer(file);
    } catch (bufErr) {
      console.error("[driving-licence] fileToBuffer failed:", bufErr);
      return errorResponse("Could not read the uploaded file. Try another photo or format (JPEG/PNG/WebP).", 422);
    }
    const meta = resolveLicenceImageMeta(file, buffer);
    if ("error" in meta) return errorResponse(meta.error, 422);
    const { typ, ext } = meta;

    let url;
    try {
      url = await persistDrivingLicenceImage(buffer, {
        userId: session.userId,
        ext,
        contentType: typ,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("MISSING_BLOB_TOKEN:")) {
        return errorResponse(msg.replace(/^MISSING_BLOB_TOKEN:\s*/, ""), 503, { code: "MISSING_BLOB_TOKEN" });
      }
      if (msg.startsWith("BLOB_ACCESS_MISMATCH:")) {
        return errorResponse(msg.replace(/^BLOB_ACCESS_MISMATCH:\s*/, ""), 422, { code: "BLOB_ACCESS_MISMATCH" });
      }
      if (isEphemeralServerFilesystem() && !resolveBlobReadWriteToken()) {
        return errorResponse(
          "Upload failed: this host cannot write uploads to disk. Set BLOB_READ_WRITE_TOKEN (Vercel: link Blob store; Cloudflare Workers: add the same secret on the Worker).",
          503,
          { code: "MISSING_BLOB_TOKEN" }
        );
      }
      console.error("[driving-licence] persist failed:", e);
      const readOnly =
        msg.includes("EROFS") || msg.includes("EPERM") || msg.includes("read-only");
      return errorResponse(
        readOnly
          ? "Upload failed: server filesystem is read-only. Set BLOB_READ_WRITE_TOKEN (Vercel Blob) and redeploy."
          : msg.slice(0, 400),
        500,
        { code: "BLOB_PERSIST_FAILED" }
      );
    }

    try {
      await setUserDrivingLicenceUrl(session.userId, { drivingLicenceUrl: url });
    } catch (dbErr) {
      console.error("[driving-licence] DB update failed:", dbErr);
      return errorResponse(
        "Upload saved but updating your profile failed. Check database connection.",
        500
      );
    }

    const company = session.companyId ? await getCompanyById(session.companyId) : null;
    const aiSettings = getAiValidationSettings(company);
    if (!aiSettings.drivingEnabled) {
      return jsonResponse({
        drivingLicenceUrl: drivingLicenceUrlForApi(url, session.userId),
        drivingLicenceStatus: "PENDING",
        aiVerified: false,
        message: "AI driving-licence validation is disabled for this company. Pending admin review.",
      });
    }

    // Send image to AI validator (optional — failures still return 200 with PENDING)
    try {
      console.info("[driving-licence] Sending image to AI verification for user", session.userId);
      const result = await verifyDrivingLicenceWithAI(buffer, typ, `${session.userId}${ext}`);
      console.info("[driving-licence] AI result:", JSON.stringify(result));
      const status = result.hasTwoPlusYearsExperience ? "APPROVED" : "REJECTED";
      await setUserDrivingLicenceStatus(session.userId, status, { verifiedBy: "AI" });
      return jsonResponse({
        drivingLicenceUrl: drivingLicenceUrlForApi(url, session.userId),
        drivingLicenceStatus: status,
        aiVerified: true,
      });
    } catch (aiErr) {
      console.warn("[driving-licence] AI verification failed:", aiErr?.message ?? aiErr);
      return jsonResponse({
        drivingLicenceUrl: drivingLicenceUrlForApi(url, session.userId),
        drivingLicenceStatus: "PENDING",
        aiVerified: false,
        message: aiErr?.message || "Licence saved; AI verification failed. An admin will review.",
      });
    }
  } catch (unexpected) {
    console.error("[driving-licence] unexpected:", unexpected);
    const isDev = process.env.NODE_ENV !== "production";
    const msg = unexpected instanceof Error ? unexpected.message : String(unexpected);
    const vercelHint = isEphemeralServerFilesystem()
      ? " Use an image under 4 MB, JPEG/PNG/WebP, and configure BLOB_READ_WRITE_TOKEN (Vercel or Cloudflare Worker)."
      : "";
    return errorResponse(
      isDev ? `Upload failed: ${msg.slice(0, 500)}` : `Upload failed.${vercelHint} Check Vercel Logs for details.`,
      500,
      { code: "DRIVING_LICENCE_UNEXPECTED" }
    );
  }
}

/**
 * DELETE /api/users/me/driving-licence – remove driving licence photo and status
 */
export async function DELETE() {
  let session;
  try {
    session = await getSession();
  } catch (e) {
    console.error("[driving-licence] DELETE getSession:", e);
    return errorResponse("Session check failed.", 503);
  }
  if (!session?.userId) return errorResponse("Unauthorized", 401);
  try {
    await clearUserDrivingLicence(session.userId);
  } catch (e) {
    console.error("[driving-licence] DELETE clear failed:", e);
    return errorResponse("Could not remove driving licence. Try again.", 500, { code: "DL_DELETE_FAILED" });
  }
  return jsonResponse({ drivingLicenceUrl: null, drivingLicenceStatus: null });
}
