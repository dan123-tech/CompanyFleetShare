/**
 * POST /api/cars/[id]/rca-document — admin uploads RCA as PDF or image (Blob or local disk; DB + content type on Car).
 */
import { requireAdmin, errorResponse, jsonResponse, requireTrustedOriginForMutation } from "@/lib/api-helpers";
import { getCarById, updateCar } from "@/lib/cars";
import { persistGloveboxPublicDocument } from "@/lib/glovebox-storage";
import { getProvider, LAYERS, PROVIDERS } from "@/lib/data-source-manager";
import { rcaDocumentUrlForClient } from "@/lib/glovebox-ref";

export const runtime = "nodejs";
export const maxDuration = 60;

/** @param {Buffer} buf */
function sniffPdfFromBuffer(buf) {
  if (!buf || buf.length < 5) return null;
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "application/pdf";
  return null;
}

/** @param {Buffer} buf */
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
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  return null;
}

const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * Browsers often send empty `type` or `application/octet-stream` for PDFs (especially on Windows).
 * @param {File} file
 * @param {Buffer} buffer
 * @returns {{ contentType: string, defaultName: string } | { error: string }}
 */
function resolveGloveboxFileMeta(file, buffer) {
  let typ = String(file.type || "").toLowerCase().trim();
  const name = (file.name || "").toLowerCase();

  if (!typ || typ === "application/octet-stream") {
    if (name.endsWith(".pdf")) typ = "application/pdf";
    else if (name.endsWith(".webp")) typ = "image/webp";
    else if (name.endsWith(".png")) typ = "image/png";
    else if (name.endsWith(".gif")) typ = "image/gif";
    else if (name.endsWith(".jpg") || name.endsWith(".jpeg")) typ = "image/jpeg";
  }
  if (typ === "image/jpg" || typ === "image/pjpeg") typ = "image/jpeg";

  const pdfMagic = sniffPdfFromBuffer(buffer);
  const imgMagic = sniffImageMimeFromBuffer(buffer);

  if (typ === "application/pdf") {
    if (!pdfMagic) return { error: "File is not a valid PDF (missing PDF signature)." };
    return { contentType: "application/pdf", defaultName: "rca.pdf" };
  }

  if (typ.startsWith("image/")) {
    if (!ALLOWED_IMAGE.has(typ)) {
      return { error: "Image must be JPEG, PNG, WebP, or GIF." };
    }
    if (!imgMagic || !ALLOWED_IMAGE.has(imgMagic)) {
      return { error: "File does not look like a supported image format." };
    }
    const ext =
      imgMagic === "image/png" ? ".png" : imgMagic === "image/webp" ? ".webp" : imgMagic === "image/gif" ? ".gif" : ".jpg";
    return { contentType: imgMagic, defaultName: `rca${ext}` };
  }

  if (pdfMagic) return { contentType: "application/pdf", defaultName: "rca.pdf" };
  if (imgMagic && ALLOWED_IMAGE.has(imgMagic)) {
    const ext =
      imgMagic === "image/png" ? ".png" : imgMagic === "image/webp" ? ".webp" : imgMagic === "image/gif" ? ".gif" : ".jpg";
    return { contentType: imgMagic, defaultName: `rca${ext}` };
  }

  return { error: "RCA file must be a PDF or an image (e.g. scan or photo)." };
}

export async function POST(request, { params }) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  const out = await requireAdmin();
  if ("response" in out) return out.response;

  try {
    const provider = await getProvider(out.session.companyId, LAYERS.CARS);
    if (provider !== PROVIDERS.LOCAL) return errorResponse("Local cars data source required", 503);
  } catch (err) {
    return errorResponse(err?.message || "Failed to verify data source", 500);
  }

  const { id: carId } = await params;
  const car = await getCarById(carId, out.session.companyId);
  if (!car) return errorResponse("Car not found", 404);

  let form;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("Expected multipart/form-data", 422);
  }

  const file = form.get("file");
  if (!file || typeof file === "string") return errorResponse("Missing file", 422);

  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.length) return errorResponse("Empty file", 422);

  const resolved = resolveGloveboxFileMeta(file, buf);
  if ("error" in resolved) return errorResponse(resolved.error, 422);

  let url;
  try {
    url = await persistGloveboxPublicDocument(buf, {
      companyId: out.session.companyId,
      carId,
      filename: file.name || resolved.defaultName,
      contentType: resolved.contentType,
    });
  } catch (e) {
    const msg = e?.message || String(e);
    console.error("[rca-document] persist failed:", msg);
    if (msg.startsWith("MISSING_BLOB_TOKEN")) {
      return errorResponse(
        "File storage is not configured for this server (missing BLOB_READ_WRITE_TOKEN). Link a Vercel Blob store or set the token on your host, then redeploy.",
        503
      );
    }
    if (msg.startsWith("BLOB_ACCESS_MISMATCH")) {
      return errorResponse(
        "Blob storage rejected the upload (wrong token or store). Check that BLOB_READ_WRITE_TOKEN matches your project’s Blob store.",
        502
      );
    }
    if (msg.includes("Vercel Blob upload failed")) {
      return errorResponse("Could not upload file to storage. Try again or check Blob configuration.", 502);
    }
    return errorResponse("Could not save the uploaded file.", 500);
  }

  try {
    await updateCar(carId, out.session.companyId, {
      rcaDocumentUrl: url,
      rcaDocumentContentType: resolved.contentType,
      rcaLastNotifiedAt: null,
    });
  } catch (e) {
    console.error("[rca-document] updateCar failed:", e?.message || e);
    return errorResponse(
      "File uploaded but the database could not be updated. Ensure tenant migrations are applied (Car.rcaDocumentUrl).",
      500
    );
  }

  return jsonResponse({ ok: true, rcaDocumentUrl: rcaDocumentUrlForClient(carId, url) });
}
