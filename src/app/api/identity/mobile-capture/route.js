import { readFile } from "fs/promises";
import path from "path";
import { get } from "@vercel/blob";
import { z } from "zod";
import { jsonResponse, errorResponse, requireTrustedOriginForMutation } from "@/lib/api-helpers";
import { DRIVING_LICENCE_PRIVATE_PREFIX } from "@/lib/driving-licence-ref";
import { resolveBlobReadWriteToken } from "@/lib/blob-env";
import { persistSelfieImage } from "@/lib/selfie-storage";
import { verifyIdentityFaceMatch } from "@/lib/identity-verification";
import { setUserIdentityStatus, setUserSelfieUrl } from "@/lib/users";
import {
  getMobileCaptureSessionByToken,
  markMobileCaptureSessionCompleted,
  markMobileCaptureSessionFailed,
  markMobileCaptureSessionProcessing,
} from "@/lib/mobile-capture-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({
  token: z.string().min(10),
});

const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function extForMime(mimeType) {
  const t = String(mimeType || "").toLowerCase();
  if (t.includes("png")) return ".png";
  if (t.includes("webp")) return ".webp";
  return ".jpg";
}

async function bufferFromStored(stored, localPrefix, localFolder, privatePrefix) {
  if (!stored) throw new Error("Missing image");

  if (stored.startsWith(localPrefix)) {
    const filename = stored.slice(localPrefix.length);
    const ext = path.extname(filename).toLowerCase();
    const mime = MIME_TYPES[ext] || "image/jpeg";
    const filepath = path.join(process.cwd(), "public", "uploads", localFolder, filename);
    const imageBuffer = await readFile(filepath);
    return { imageBuffer, mimeType: mime };
  }

  if (stored.startsWith(privatePrefix)) {
    const pathname = stored.slice(privatePrefix.length);
    const token = resolveBlobReadWriteToken();
    if (!token) throw new Error("Blob storage not configured");
    const result = await get(pathname, { access: "private", token });
    if (!result) throw new Error("Image not found");
    const imageBuffer = Buffer.from(await new Response(result.stream).arrayBuffer());
    return { imageBuffer, mimeType: result.blob.contentType || "image/jpeg" };
  }

  if (stored.startsWith("https://") || stored.startsWith("http://")) {
    const isPrivate = stored.includes(".private.blob.vercel-storage.com");
    const token = resolveBlobReadWriteToken();
    const result = await get(stored, { access: isPrivate ? "private" : "public", ...(token ? { token } : {}) });
    if (!result) throw new Error("Image not found");
    const imageBuffer = Buffer.from(await new Response(result.stream).arrayBuffer());
    return { imageBuffer, mimeType: result.blob.contentType || "image/jpeg" };
  }

  throw new Error("Unsupported image reference");
}

function sessionState(session) {
  if (!session) return "invalid";
  if (session.usedAt || session.status === "COMPLETED") return "used";
  if (new Date(session.expiresAt).getTime() < Date.now()) return "expired";
  return "active";
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ token: searchParams.get("token") });
  if (!parsed.success) return errorResponse("Token is required", 422);

  const session = await getMobileCaptureSessionByToken(parsed.data.token);
  if (!session) return errorResponse("Invalid verification link", 404);

  const state = sessionState(session);
  if (state === "used") return errorResponse("This verification link has already been used.", 410);
  if (state === "expired") return errorResponse("This verification link expired. Request a new one.", 410);

  return jsonResponse({
    ok: true,
    expiresAt: session.expiresAt,
    userName: session.user?.name || null,
    companyName: session.company?.name || null,
  });
}

export async function POST(request) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  const form = await request.formData();
  const token = String(form.get("token") || "").trim();
  const parsed = querySchema.safeParse({ token });
  if (!parsed.success) return errorResponse("Token is required", 422);

  const file = form.get("file") || form.get("liveScan") || form.get("image") || form.get("selfie");
  if (!file || typeof file === "string") {
    return errorResponse("Live face image is required.", 422);
  }

  const session = await getMobileCaptureSessionByToken(parsed.data.token);
  if (!session) return errorResponse("Invalid verification link", 404);

  const state = sessionState(session);
  if (state === "used") return errorResponse("This verification link has already been used.", 410);
  if (state === "expired") return errorResponse("This verification link expired. Request a new one.", 410);
  if (!session.user?.drivingLicenceUrl) return errorResponse("Driving licence image is required first.", 422);

  await markMobileCaptureSessionProcessing(session.id);
  await setUserIdentityStatus(session.userId, "PENDING", { reason: "Mobile verification started" });

  try {
    const licence = await bufferFromStored(
      session.user.drivingLicenceUrl,
      "/uploads/driving-licences/",
      "driving-licences",
      DRIVING_LICENCE_PRIVATE_PREFIX
    );
    const liveScanBuffer = Buffer.from(await file.arrayBuffer());
    const liveMime = (file.type || "image/jpeg").toLowerCase();
    const liveExt = extForMime(liveMime);

    try {
      const storedSelfie = await persistSelfieImage(liveScanBuffer, {
        userId: session.userId,
        ext: liveExt,
        contentType: liveMime,
      });
      await setUserSelfieUrl(session.userId, { selfieUrl: storedSelfie });
    } catch {
      // Keep verification flow running even if preview image persistence fails.
    }

    const result = await verifyIdentityFaceMatch(
      { ...licence, filename: `licence-${session.userId}.jpg` },
      { imageBuffer: liveScanBuffer, mimeType: liveMime, filename: `mobile-selfie-${session.userId}.jpg` }
    );

    if (result.match) {
      await setUserIdentityStatus(session.userId, "VERIFIED", {
        verifiedBy: "AI",
        score: result.score,
        reason: "Mobile selfie matches driving licence photo",
      });
      await markMobileCaptureSessionCompleted(session.id);
      return jsonResponse({ ok: true, identityStatus: "VERIFIED", identityScore: result.score });
    }

    await setUserIdentityStatus(session.userId, "REJECTED", {
      verifiedBy: "AI",
      score: result.score,
      reason: "Mobile selfie did not match driving licence photo",
    });
    await markMobileCaptureSessionCompleted(session.id);
    return jsonResponse({ ok: true, identityStatus: "REJECTED", identityScore: result.score });
  } catch (err) {
    await setUserIdentityStatus(session.userId, "PENDING_REVIEW", {
      verifiedBy: "AI",
      reason: err?.message || "Mobile face-match failed",
    });
    await markMobileCaptureSessionFailed(session.id);
    return jsonResponse({
      ok: true,
      identityStatus: "PENDING_REVIEW",
      message: err?.message || "Identity verification failed. Pending admin review.",
    });
  }
}
