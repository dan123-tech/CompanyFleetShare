import { CompareFacesCommand, RekognitionClient } from "@aws-sdk/client-rekognition";

/**
 * Optional fallback when the external face match / session API fails.
 * Configure AWS_REGION + AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY on Vercel.
 */
export function isRekognitionFaceCompareConfigured() {
  if (String(process.env.IDENTITY_FACE_REKOGNITION_FALLBACK || "true").toLowerCase() === "false") {
    return false;
  }
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!region) return false;
  return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

function toBytes(buf) {
  if (Buffer.isBuffer(buf)) return buf;
  return Buffer.from(buf);
}

/**
 * Compare selfie (source) to licence portrait (target). Returns shape compatible with identity verification.
 * Rekognition does not provide liveness; caller may treat provider === "rekognition" as match-only verification.
 */
export async function compareLicenceSelfieWithRekognition(licenceBuffer, selfieBuffer) {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const client = new RekognitionClient({ region });
  const minSimilarity = parseFloat(process.env.AWS_REKOGNITION_MIN_SIMILARITY || "80");
  const clamped = Math.min(100, Math.max(0, minSimilarity));

  const res = await client.send(
    new CompareFacesCommand({
      SimilarityThreshold: clamped,
      SourceImage: { Bytes: toBytes(selfieBuffer) },
      TargetImage: { Bytes: toBytes(licenceBuffer) },
    })
  );

  const top = res.FaceMatches?.[0];
  const similarity = typeof top?.Similarity === "number" ? top.Similarity : 0;
  const score = similarity / 100;
  const match = similarity >= clamped;
  const faceDetected = Boolean(res.SourceImageFace?.BoundingBox);

  return {
    match,
    liveness: null,
    score: Number.isFinite(score) ? score : null,
    faceDetected,
    provider: "rekognition",
    raw: res,
  };
}
