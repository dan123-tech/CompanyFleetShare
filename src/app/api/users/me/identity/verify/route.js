import { readFile } from "fs/promises";
import path from "path";
import { get } from "@vercel/blob";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyIdentityFaceMatch } from "@/lib/identity-verification";
import { setUserIdentityStatus } from "@/lib/users";
import { DRIVING_LICENCE_PRIVATE_PREFIX } from "@/lib/driving-licence-ref";
import { resolveBlobReadWriteToken } from "@/lib/blob-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

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

export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) return errorResponse("Unauthorized", 401);

  const parsed = await request.formData();
  const liveScanFile = parsed.get("liveScan") || parsed.get("file") || parsed.get("image");
  if (!liveScanFile || typeof liveScanFile === "string") {
    return errorResponse("Live face scan image is required.", 422);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { drivingLicenceUrl: true },
  });
  if (!user?.drivingLicenceUrl) return errorResponse("Driving licence image is required first.", 422);

  await setUserIdentityStatus(session.userId, "PENDING", { reason: "Verification started" });

  try {
    const licence = await bufferFromStored(
      user.drivingLicenceUrl,
      "/uploads/driving-licences/",
      "driving-licences",
      DRIVING_LICENCE_PRIVATE_PREFIX
    );
    const liveScanBuffer = Buffer.from(await liveScanFile.arrayBuffer());
    const liveMime = (liveScanFile.type || "image/jpeg").toLowerCase();

    const result = await verifyIdentityFaceMatch(
      { ...licence, filename: `licence-${session.userId}.jpg` },
      { imageBuffer: liveScanBuffer, mimeType: liveMime, filename: `live-scan-${session.userId}.jpg` }
    );

    if (result.match && result.liveness === true) {
      await setUserIdentityStatus(session.userId, "VERIFIED", {
        verifiedBy: "AI",
        score: result.score,
        reason: "Face match and liveness passed",
      });
      return jsonResponse({ identityStatus: "VERIFIED", identityScore: result.score, aiVerified: true });
    }

    if (result.liveness === false || result.match === false) {
      const reason =
        result.liveness === false
          ? "Liveness check failed"
          : "Face match did not pass threshold";
      await setUserIdentityStatus(session.userId, "REJECTED", {
        verifiedBy: "AI",
        score: result.score,
        reason,
      });
      return jsonResponse({ identityStatus: "REJECTED", identityScore: result.score, aiVerified: true });
    }

    await setUserIdentityStatus(session.userId, "PENDING_REVIEW", {
      verifiedBy: "AI",
      score: result.score,
      reason: "Incomplete liveness response; admin review required",
    });
    return jsonResponse({
      identityStatus: "PENDING_REVIEW",
      identityScore: result.score,
      aiVerified: false,
      message: "Face scan completed but liveness result was inconclusive. Pending admin review.",
    });
  } catch (err) {
    await setUserIdentityStatus(session.userId, "PENDING_REVIEW", {
      verifiedBy: "AI",
      reason: err?.message || "Face-match service failed",
    });
    return jsonResponse({
      identityStatus: "PENDING_REVIEW",
      aiVerified: false,
      message: err?.message || "Identity verification failed. Pending admin review.",
    });
  }
}

