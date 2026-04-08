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
const SESSION_FLOW_MODE = String(process.env.AI_FACE_RECOGNITION_USE_SESSION_FLOW || "").toLowerCase();
const USE_SESSION_FLOW_FALLBACK =
  SESSION_FLOW_MODE === "true" ||
  (SESSION_FLOW_MODE !== "false" &&
    /ai-face-recognition(-nine)?\.vercel\.app/i.test(DEFAULT_AI_URL));

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

function normalizeFaceMatchResult(data) {
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

function toBase64(buffer) {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(buffer)) {
    return buffer.toString("base64");
  }
  return Buffer.from(buffer).toString("base64");
}

async function trySessionFlow(base, licence, liveScan, controller) {
  const headers = buildFaceAuthHeaders();
  const licenceB64 = toBase64(licence.imageBuffer);
  const liveScanB64 = toBase64(liveScan.imageBuffer);
  const liveScanDataUrl = `data:${liveScan.mimeType || "image/jpeg"};base64,${liveScanB64}`;
  const createUrl = `${base}/api/session-create`;
  const createForm = new FormData();
  const licencePart = makeImagePart(licence.imageBuffer, licence.mimeType, licence.filename);
  createForm.append("license_image", licencePart, licence.filename);
  createForm.append("licence", licencePart, licence.filename);
  const createRes = await fetch(createUrl, {
    method: "POST",
    body: createForm,
    signal: controller.signal,
    headers,
  });
  if (createRes.status === 404 || createRes.status === 405) {
    await createRes.text();
    return null;
  }
  if (createRes.status === 401) {
    const text401 = await createRes.text();
    throw new Error(
      `Face session-create returned 401 (authentication required). Configure AI_FACE_RECOGNITION_AUTHORIZATION or AI_FACE_RECOGNITION_BYPASS_TOKEN. ${text401.slice(0, 120)}`
    );
  }
  if (!createRes.ok) {
    const text = await createRes.text();
    if (
      createRes.status === 500 &&
      text.includes("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN")
    ) {
      throw new Error(
        "Face validator is missing session storage configuration. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in the ai-face-recognition Vercel project."
      );
    }
    throw new Error(`Face session-create returned ${createRes.status}: ${text.slice(0, 200)}`);
  }
  const created = await createRes.json();
  let sessionId =
    created?.session_id || created?.sessionId || created?.id || created?.data?.session_id;
  if (!sessionId) {
    throw new Error("Face session-create response missing session_id");
  }

  const verifyUrl = `${base}/api/session-verify`;
  const verifySession = async (sid, mode) => {
    if (mode === "json") {
      return fetch(verifyUrl, {
        method: "POST",
        body: JSON.stringify({
          session_id: String(sid),
          selfie_image: liveScanB64,
          selfie_image_base64: liveScanB64,
          image: liveScanB64,
          mime_type: liveScan.mimeType || "image/jpeg",
        }),
        signal: controller.signal,
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
      });
    }

    const verifyForm = new FormData();
    verifyForm.append("session_id", String(sid));
    if (mode === "base64" || mode === "dataurl") {
      const value = mode === "dataurl" ? liveScanDataUrl : liveScanB64;
      verifyForm.append("selfie_image", value);
      verifyForm.append("selfie_image_base64", value);
      verifyForm.append("selfie", value);
      verifyForm.append("liveScan", value);
      verifyForm.append("image", value);
      verifyForm.append("selfie_mime_type", liveScan.mimeType || "image/jpeg");
      verifyForm.append("mime_type", liveScan.mimeType || "image/jpeg");
    } else {
      // mode === "file"
      const liveScanPart = makeImagePart(liveScan.imageBuffer, liveScan.mimeType, liveScan.filename);
      verifyForm.append("selfie_image", liveScanPart, liveScan.filename);
      verifyForm.append("selfie", liveScanPart, liveScan.filename);
      verifyForm.append("liveScan", liveScanPart, liveScan.filename);
      verifyForm.append("image", liveScanPart, liveScan.filename);
    }
    return fetch(verifyUrl, {
      method: "POST",
      body: verifyForm,
      signal: controller.signal,
      headers,
    });
  };

  let verifyRes = await verifySession(sessionId, "file");
  if (verifyRes.status === 404 || verifyRes.status === 405) {
    const text = await verifyRes.text();
    throw new Error(`Face session-verify endpoint unavailable: ${text.slice(0, 200)}`);
  }
  if (!verifyRes.ok) {
    const firstText = await verifyRes.text();
    const looksBase64Related =
      firstText.toLowerCase().includes("atob() called with invalid base64") ||
      firstText.toLowerCase().includes("invalid base64") ||
      firstText.toLowerCase().includes("not valid base64");

    if (verifyRes.status >= 400 && looksBase64Related) {
      // Retry expected backend encodings without recreating the session.
      const modes = ["base64", "dataurl", "json"];
      let lastErr = firstText;
      for (const mode of modes) {
        verifyRes = await verifySession(sessionId, mode);
        if (verifyRes.ok) break;
        lastErr = await verifyRes.text();
      }
      if (!verifyRes.ok) {
        throw new Error(
          `Face session-verify retries failed: ${verifyRes.status}: ${String(lastErr).slice(0, 200)}`
        );
      }
    } else {
      throw new Error(`Face session-verify returned ${verifyRes.status}: ${firstText.slice(0, 200)}`);
    }
  }
  const verified = await verifyRes.json();
  return normalizeFaceMatchResult(verified);
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
      return normalizeFaceMatchResult(data);
    }

    if (USE_SESSION_FLOW_FALLBACK) {
      const sessionFlowResult = await trySessionFlow(base, licence, liveScan, controller);
      if (sessionFlowResult) return sessionFlowResult;
    }

    if (!USE_SESSION_FLOW_FALLBACK) {
      throw new Error(
        `Face match endpoint not found on ${base} (tried: ${paths.join(
          ", "
        )}). Session flow fallback is disabled (no Upstash mode).`
      );
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

