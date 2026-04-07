/**
 * Minimal iCalendar (ICS) VEVENT builder for reservation export.
 * @see https://datatracker.ietf.org/doc/html/rfc5545
 */

function escapeIcsText(value) {
  if (value == null) return "";
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function formatUtc(dt) {
  const d = dt instanceof Date ? dt : new Date(dt);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

/**
 * @param {Object} opts
 * @param {string} opts.uid - globally unique id (e.g. res-id@host)
 * @param {Date|string} opts.startDate
 * @param {Date|string} opts.endDate
 * @param {string} opts.summary
 * @param {string} [opts.description]
 * @param {string} [opts.organizerName]
 * @param {string} [opts.organizerEmail]
 */
export function buildReservationIcs({
  uid,
  startDate,
  endDate,
  summary,
  description,
  organizerName,
  organizerEmail,
}) {
  const dtStamp = formatUtc(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Company Car Sharing//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${formatUtc(startDate)}`,
    `DTEND:${formatUtc(endDate)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
  ];
  if (description) {
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  }
  if (organizerEmail) {
    const cn = organizerName ? `CN=${escapeIcsText(organizerName)}:` : "";
    lines.push(`ORGANIZER;${cn}MAILTO:${escapeIcsText(organizerEmail)}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function calendarHostFromEnv() {
  const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || process.env.APP_URL || "localhost";
  try {
    if (raw.startsWith("http")) {
      return new URL(raw).host;
    }
    return raw.replace(/^https?:\/\//, "").split("/")[0] || "localhost";
  } catch {
    return "localhost";
  }
}

/**
 * Multi-event calendar feed (subscribe in Outlook / Google Calendar).
 * @param {Array<{ uid: string, startDate: Date|string, endDate: Date|string, summary: string, description?: string }>} events
 */
export function buildReservationFeedIcs(events) {
  const host = calendarHostFromEnv();
  const dtStamp = formatUtc(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FleetShare//Reservation feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const ev of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(ev.uid)}@${escapeIcsText(host)}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${formatUtc(ev.startDate)}`,
      `DTEND:${formatUtc(ev.endDate)}`,
      `SUMMARY:${escapeIcsText(ev.summary)}`
    );
    if (ev.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
