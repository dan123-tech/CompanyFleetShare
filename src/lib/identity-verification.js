const DEFAULT_AI_URL =
  process.env.AI_FACE_RECOGNITION_URL ||
  process.env.AI_FACE_MATCH_URL ||
  process.env.AI_DRIVING_LICENCE_LLM_CLOUDFLARE_URL ||
  process.env.AI_VERIFICATION_URL ||
  "http://localhost:8080";
const AI_TIMEOUT_MS = parseInt(
  process.env.AI_FACE_RECOGNITION_TIMEOUT_MS ||
    process.env.AI_FACE_MATCH_TIMEOUT_MS ||
    "30000",
  10
);
const AI_MATCH_THRESHOLD = parseFloat(process.env.AI_FACE_MATCH_THRESHOLD || "0.35");

function buildCandidatePaths() {
  const configured = (
    process.env.AI_FACE_RECOGNITION_VERIFY_PATH ||
    process.env.AI_FACE_MATCH_PATH ||
    "/verify"
  ).trim();
  const candidates = [configured];
  if (configured !== "/verify") candidates.push("/verify");
  if (configured !== "/face-match") candidates.push("/face-match");
  return [...new Set(candidates)];
}

function makeImagePart(buffer, mimeType, filename) {
  const type = mimeType || "image/jpeg";
  if (typeof File !== "undefined") {
    try {
      return new File([buffer], filename, { type });
    } catch {
      return new Blob([buffer], { type });
    }
  }
  return new Blob([buffer], { type });
}

/**
 * @param {{ imageBuffer: Buffer, mimeType: string, filename: string }} licence
 * @param {{ imageBuffer: Buffer, mimeType: string, filename: string }} liveScan
 */
export async function verifyIdentityFaceMatch(licence, liveScan) {
  const base = DEFAULT_AI_URL.replace(/\/$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    let lastError = null;
    const paths = buildCandidatePaths();

    for (const p of paths) {
      const url = `${base}${p}`;
      const form = new FormData();
      const licencePart = makeImagePart(licence.imageBuffer, licence.mimeType, licence.filename);
      const liveScanPart = makeImagePart(liveScan.imageBuffer, liveScan.mimeType, liveScan.filename);
      form.append("licence", licencePart, licence.filename);
      // Keep multiple field names for broad backend compatibility.
      form.append("liveScan", liveScanPart, liveScan.filename);
      form.append("selfie", liveScanPart, liveScan.filename);
      form.append("image", liveScanPart, liveScan.filename);

      const res = await fetch(url, { method: "POST", body: form, signal: controller.signal });
      if (res.status === 404) {
        const text404 = await res.text();
        lastError = new Error(`Face match returned 404 on ${p}: ${text404.slice(0, 200)}`);
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Face match returned ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      const rawScore = data?.score ?? data?.similarity ?? data?.matchScore;
      const score = typeof rawScore === "number" ? rawScore : Number(rawScore);
      const matchRaw = data?.match ?? data?.faceMatch ?? data?.isMatch;
      const matchFromService = matchRaw === true || String(matchRaw).toLowerCase() === "true";
      const livenessRaw = data?.liveness ?? data?.isLive ?? data?.livePassed ?? data?.live;
      const liveness =
        livenessRaw == null ? null : livenessRaw === true || String(livenessRaw).toLowerCase() === "true";
      const thresholdMatch = Number.isFinite(score) ? score >= AI_MATCH_THRESHOLD : false;
      return {
        match: matchFromService || thresholdMatch,
        liveness,
        score: Number.isFinite(score) ? score : null,
        faceDetected: data?.faceDetected ?? null,
        raw: data,
      };
    }

    throw lastError || new Error("Face match endpoint not found.");
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("Identity verification timed out.");
    }
    const msg = err?.message || String(err);
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      throw new Error("Identity verification service is not reachable.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

