import { jsonResponse, errorResponse } from "@/lib/api-helpers";
import { getSession } from "@/lib/auth";
import { setUserSelfieUrl, clearUserSelfie } from "@/lib/users";
import { persistSelfieImage } from "@/lib/selfie-storage";
import { selfieUrlForApi } from "@/lib/selfie-ref";
import { resolveBlobReadWriteToken, isEphemeralServerFilesystem } from "@/lib/blob-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 4 * 1024 * 1024; // 4 MB

function sniffImageMimeFromBuffer(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  return null;
}

function resolveImageMeta(file, buffer) {
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
  if (!ALLOWED_TYPES.includes(typ)) return { error: "Only JPEG, PNG or WebP images allowed." };
  const ext = typ === "image/png" ? ".png" : typ === "image/webp" ? ".webp" : ".jpg";
  return { typ, ext };
}

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
    const session = await getSession();
    if (!session?.userId) return errorResponse("Unauthorized", 401);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") return errorResponse("Missing or invalid file", 422);
    if (file.size > MAX_SIZE) return errorResponse(`File too large (max ${MAX_SIZE / (1024 * 1024)} MB).`, 422);

    const buffer = await fileToBuffer(file);
    const meta = resolveImageMeta(file, buffer);
    if ("error" in meta) return errorResponse(meta.error, 422);
    const { typ, ext } = meta;

    let url;
    try {
      url = await persistSelfieImage(buffer, { userId: session.userId, ext, contentType: typ });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("MISSING_BLOB_TOKEN:")) return errorResponse(msg.replace(/^MISSING_BLOB_TOKEN:\s*/, ""), 503, { code: "MISSING_BLOB_TOKEN" });
      if (msg.startsWith("BLOB_ACCESS_MISMATCH:")) return errorResponse(msg.replace(/^BLOB_ACCESS_MISMATCH:\s*/, ""), 422, { code: "BLOB_ACCESS_MISMATCH" });
      if (isEphemeralServerFilesystem() && !resolveBlobReadWriteToken()) {
        return errorResponse("Upload failed: this host cannot write uploads to disk. Set BLOB_READ_WRITE_TOKEN.", 503, { code: "MISSING_BLOB_TOKEN" });
      }
      return errorResponse(msg.slice(0, 400), 500, { code: "BLOB_PERSIST_FAILED" });
    }

    await setUserSelfieUrl(session.userId, { selfieUrl: url });
    return jsonResponse({
      selfieUrl: selfieUrlForApi(url, session.userId),
      identityStatus: "PENDING",
    });
  } catch (unexpected) {
    console.error("[selfie] unexpected:", unexpected);
    const msg = unexpected instanceof Error ? unexpected.message : String(unexpected);
    return errorResponse(`Upload failed: ${msg.slice(0, 400)}`, 500, { code: "SELFIE_UNEXPECTED" });
  }
}

export async function DELETE() {
  const session = await getSession();
  if (!session?.userId) return errorResponse("Unauthorized", 401);
  try {
    await clearUserSelfie(session.userId);
    return jsonResponse({ selfieUrl: null, identityStatus: null });
  } catch (e) {
    console.error("[selfie] DELETE clear failed:", e);
    return errorResponse("Could not remove selfie. Try again.", 500, { code: "SELFIE_DELETE_FAILED" });
  }
}

