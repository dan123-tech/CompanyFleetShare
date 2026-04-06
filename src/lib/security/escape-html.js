/**
 * Escape text for safe insertion into HTML (before limited markdown → HTML conversion).
 */

export function escapeHtml(text) {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Only http(s), same-path relative (single leading /), or mailto for chat links.
 * Blocks javascript:, data:, vbscript:, etc.
 * @param {string} href
 */
export function isSafeChatHref(href) {
  const t = String(href || "").trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
    return false;
  }
  if (t.startsWith("/") && !t.startsWith("//")) return true;
  if (lower.startsWith("mailto:") && !lower.includes("<") && t.length < 2048) return true;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
