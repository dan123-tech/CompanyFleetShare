function normalizeBaseUrl(raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v.replace(/\/$/, "");
  return `https://${v}`.replace(/\/$/, "");
}

const DEFAULT_AI_URL = normalizeBaseUrl(
  process.env.AI_FACE_RECOGNITION_URL ||
    process.env.FACE_VALIDATOR_URL ||
    process.env.AI_FACE_MATCH_URL ||
    process.env.AI_VERIFICATION_URL ||
    "http://localhost:8080"
);
const AI_TIMEOUT_MS = parseInt(
  process.env.AI_FACE_RECOGNITION_TIMEOUT_MS ||
    process.env.AI_FACE_MATCH_TIMEOUT_MS ||
    "30000",
  10
);
const AI_MATCH_THRESHOLD = parseFloat(process.env.AI_FACE_MATCH_THRESHOLD || "0.35");

function buildFaceAuthHeaders() {
  const headers = {};
  const auth =
    process.env.AI_FACE_RECOGNITION_AUTHORIZATION ||
    process.env.FACE_VALIDATOR_AUTHORIZATION ||
    process.env.AI_BACKEND_AUTHORIZATION ||
    "";
  const bypass =
    process.env.AI_FACE_RECOGNITION_BYPASS_TOKEN ||
    process.env.FACE_VALIDATOR_BYPASS_TOKEN ||
    process.env.AI_BACKEND_BYPASS_TOKEN ||
    "";
  if (auth.trim()) headers.Authorization = auth.trim();
  if (bypass.trim()) headers["x-vercel-protection-bypass"] = bypass.trim();
  return headers;
}

function buildCandidatePaths(base) {
  const configuredRaw = (
    process.env.AI_FACE_RECOGNITION_VERIFY_PATH ||
    process.env.FACE_VALIDATOR_ENDPOINT ||
    process.env.AI_FACE_MATCH_PATH ||
    "/verify"
  ).trim();
  const normalizedConfigured = configuredRaw.startsWith("/") ? configuredRaw : `/${configuredRaw}`;
  const parsedBasePath = (() => {
    try {
      const u = new URL(base);
      const p = (u.pathname || "").replace(/\/+$/, "");
      return p && p !== "/" ? p : "";
    } catch {
      return "";
    }
  })();
  // Prefer stable default endpoints first, then custom configured path.
  const candidates = [
    "",
    "/",
    parsedBasePath,
    normalizedConfigured,
    "/verify",
    "/api/verify",
    "/face-match",
    "/api/face-match",
    "/verify-license-face",
    "/api/verify-license-face",
    "/verify-face",
    "/api/verify-face",
    "/match",
    "/api/match",
    "/compare",
    "/api/compare",
  ];
  return [...new Set(candidates.filter((p) => p != null && p !== "undefined"))];
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
  if (!base) {
    throw new Error(
      "Face recognition backend URL is not configured. Set AI_FACE_RECOGNITION_URL."
    );
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const paths = buildCandidatePaths(base);

    for (const p of paths) {
      const url = p === "" || p === "/" ? base : `${base}${p}`;
      const form = new FormData();
      const licencePart = makeImagePart(licence.imageBuffer, licence.mimeType, licence.filename);
      const liveScanPart = makeImagePart(liveScan.imageBuffer, liveScan.mimeType, liveScan.filename);
      form.append("licence", licencePart, licence.filename);
      // Keep multiple field names for broad backend compatibility.
      form.append("liveScan", liveScanPart, liveScan.filename);
      form.append("selfie", liveScanPart, liveScan.filename);
      form.append("image", liveScanPart, liveScan.filename);

      const res = await fetch(url, {
        method: "POST",
        body: form,
        signal: controller.signal,
        headers: buildFaceAuthHeaders(),
      });
      if (res.status === 404 || res.status === 405) {
        await res.text();
        continue;
      }
      if (res.status === 401) {
        const text401 = await res.text();
        throw new Error(
          `Face match returned 401 (authentication required). Configure AI_FACE_RECOGNITION_AUTHORIZATION or AI_FACE_RECOGNITION_BYPASS_TOKEN. ${text401.slice(0, 120)}`
        );
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

    throw new Error(`Face match endpoint not found on ${base} (tried: ${paths.join(", ")})`);
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

