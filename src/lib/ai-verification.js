/**
 * AI Verification – call AI backend service to verify driving licence experience.
 * Base URL priority:
 * 1) AI_DRIVING_LICENCE_LLM_CLOUDFLARE_URL (recommended on Vercel)
 * 2) AI_VERIFICATION_URL (legacy / local Docker)
 * 3) http://localhost:8080
 * Form field: AI_VERIFY_FORM_FIELD (default "file") – some services expect "image"
 */

const DEFAULT_AI_URL =
  process.env.AI_DRIVING_LICENCE_LLM_CLOUDFLARE_URL ||
  process.env.AI_VERIFICATION_URL ||
  "http://localhost:8080";
const AI_VERIFY_PATH = process.env.AI_VERIFY_PATH || "/validate";
const AI_FORM_FIELD = process.env.AI_VERIFY_FORM_FIELD || "file";
const AI_TIMEOUT_MS = parseInt(process.env.AI_VERIFICATION_TIMEOUT_MS || "30000", 10);

/**
 * Normalize various validator JSON shapes into approved (2+ years) or not.
 * @param {unknown} data
 * @returns {boolean}
 */
export function hasTwoPlusYearsFromAIResponse(data) {
  if (data == null) return false;

  const visit = (obj, depth = 0) => {
    if (obj == null || typeof obj !== "object" || depth > 4) return false;
    const o = obj;

    if (o.hasTwoPlusYearsExperience === true || o.has_two_plus_years_experience === true) return true;
    if (o.approved === true || o.eligible === true || o.is_eligible === true || o.valid === true) return true;
    if (String(o.approved).toLowerCase() === "true") return true;
    const r = String(o.result || o.status || o.decision || "").toLowerCase();
    if (r === "approved" || r === "pass" || r === "eligible") return true;

    const years =
      o.years_of_experience ??
      o.yearsOfExperience ??
      o.experience_years ??
      o.experienceYears ??
      o.years ??
      o.experience;
    if (typeof years === "number" && !Number.isNaN(years) && years >= 2) return true;
    if (typeof years === "string") {
      const n = parseFloat(years.replace(/,/g, "."));
      if (!Number.isNaN(n) && n >= 2) return true;
    }

    // Nested payloads (e.g. { data: { ... } }, { analysis: { ... } })
    for (const key of ["data", "analysis", "result", "payload", "response"]) {
      if (o[key] && typeof o[key] === "object" && visit(o[key], depth + 1)) return true;
    }
    return false;
  };

  return visit(data, 0);
}

function buildLicenceFormData(imageBuffer, mimeType, filename, fieldName) {
  const form = new FormData();
  const type = mimeType || "image/jpeg";
  if (typeof File !== "undefined") {
    try {
      const file = new File([imageBuffer], filename, { type });
      form.append(fieldName, file);
    } catch {
      const blob = new Blob([imageBuffer], { type });
      form.append(fieldName, blob, filename);
    }
  } else {
    const blob = new Blob([imageBuffer], { type });
    form.append(fieldName, blob, filename);
  }
  return form;
}

async function postLicenceToAI(url, imageBuffer, mimeType, filename, fieldName, signal) {
  const form = buildLicenceFormData(imageBuffer, mimeType, filename, fieldName);
  return fetch(url, { method: "POST", body: form, signal });
}

/**
 * @param {Buffer} imageBuffer
 * @param {string} mimeType
 * @param {string} [filename]
 * @returns {Promise<{ hasTwoPlusYearsExperience: boolean, raw?: object }>}
 */
export async function verifyDrivingLicenceWithAI(imageBuffer, mimeType, filename = "driving-licence.jpg") {
  const base = DEFAULT_AI_URL.replace(/\/$/, "");
  const url = `${base}${AI_VERIFY_PATH}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  let res;
  const primaryField = AI_FORM_FIELD;
  const altField = primaryField === "file" ? "image" : "file";

  try {
    if (process.env.NODE_ENV !== "production") {
      console.info("[ai-verification] POST", url, "field=", primaryField);
    }
    res = await postLicenceToAI(url, imageBuffer, mimeType, filename, primaryField, controller.signal);

    // FastAPI often returns 422 if multipart field name doesn't match UploadFile param
    if (res.status === 422) {
      const t = await res.text();
      if (process.env.NODE_ENV !== "production") {
        console.warn("[ai-verification] 422 with field", primaryField, "retrying field", altField, t.slice(0, 200));
      }
      res = await postLicenceToAI(url, imageBuffer, mimeType, filename, altField, controller.signal);
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("AI verification timed out. Please try again or ask an admin to review.");
    }
    const msg = err?.message || String(err);
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      throw new Error("AI verification service is not reachable. Your licence was saved and is pending manual review.");
    }
    throw new Error("AI verification failed: " + msg);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const text = await res.text();
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ai-verification] non-OK", res.status, text.slice(0, 500));
    }
    throw new Error(
      res.status === 503 || res.status === 502
        ? "AI verification service is temporarily unavailable. Your licence is pending manual review."
        : `AI verification returned ${res.status}: ${text.slice(0, 200)}`
    );
  }

  let data;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("AI verification returned invalid response. Your licence is pending manual review.");
    }
  }

  const hasTwoPlusYearsExperience = hasTwoPlusYearsFromAIResponse(data);
  if (process.env.NODE_ENV !== "production") {
    console.info("[ai-verification] parsed approved=", hasTwoPlusYearsExperience, "keys=", data && typeof data === "object" ? Object.keys(data) : []);
  }

  return {
    hasTwoPlusYearsExperience: Boolean(hasTwoPlusYearsExperience),
    raw: data,
  };
}
