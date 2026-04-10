/**
 * Journey log PDF (foaie de parcurs) — generated from reservation + release data.
 * - Dates formatted in the user's local timezone (tz param, default Europe/Bucharest).
 * - Language: "ro" or "en" (lang param).
 * - No Romanian diacritics — jsPDF built-in fonts don't support them reliably.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  drawPdfHeader,
  finalizePdfFooters,
  addSectionTitle,
  checkPageBreak,
} from "./pdf-report";
import fs from "fs";
import path from "path";

const BLUE = [24, 95, 165];
const DARK = [30, 41, 59];
const GREY = [100, 116, 139];
const WHITE = [255, 255, 255];
const LIGHT = [241, 245, 249];
const GREEN_LIGHT = [240, 253, 244];
const ORANGE_LIGHT = [255, 247, 237];

// ── Translations ──────────────────────────────────────────────────────────────
const T = {
  en: {
    title: "Journey Sheet",
    generated: "Generated",
    driver: "Driver",
    vehicle: "Vehicle",
    actualPickup: "Actual departure",
    actualReturn: "Actual return",
    totalDuration: "Total duration",
    kmDriven: "Km driven",
    sec1: "1. Vehicle & Driver Identification",
    company: "Company / operator",
    driverName: "Driver",
    driverEmail: "Driver email",
    vehicleLabel: "Vehicle",
    vehicleCategory: "Category",
    regNumber: "Registration no.",
    purpose: "Trip purpose",
    reservationId: "Reservation ID",
    sec2: "2. Trip Period",
    colIndicator: "Indicator",
    colPlanned: "Planned",
    colActual: "Actual",
    plannedDep: "Planned departure",
    plannedRet: "Planned return",
    plannedDur: "Planned duration",
    sec3: "3. Mileage",
    colValue: "Value",
    odomStart: "Odometer at departure",
    odomEnd: "Odometer at return",
    kmTrip: "Km driven on this trip",
    sec4: "4. Confirmation & Signatures",
    sigDriver: "Driver",
    sigManager: "Fleet manager",
    sigApproved: "Verified / Approved",
    sigLine: "Signature",
    noteLabel: "Note:",
    noteText: (startDate, endDate, tz) =>
      `Reservation period: ${startDate} \u2013 ${endDate}. Actual pickup and return times are recorded automatically by the system when the corresponding buttons are pressed in the app. Time shown uses timezone: ${tz}. Data sourced from FleetShare reservation system. Retain this document for expense justification per applicable tax legislation.`,
  },
  ro: {
    title: "Foaie de parcurs",
    generated: "Generat",
    driver: "Conducator auto",
    vehicle: "Autovehicul",
    actualPickup: "Plecare efectiva",
    actualReturn: "Returnare efectiva",
    totalDuration: "Durata totala deplasare",
    kmDriven: "Km parcursi",
    sec1: "1. Identificare vehicul si conducator",
    company: "Companie / operator",
    driverName: "Conducator auto",
    driverEmail: "Email conducator",
    vehicleLabel: "Autovehicul",
    vehicleCategory: "Categorie",
    regNumber: "Nr. inmatriculare",
    purpose: "Scopul deplasarii",
    reservationId: "ID rezervare",
    sec2: "2. Perioada de deplasare",
    colIndicator: "Indicator",
    colPlanned: "Planificat",
    colActual: "Efectiv",
    plannedDep: "Plecare planificata",
    plannedRet: "Returnare planificata",
    plannedDur: "Durata planificata",
    sec3: "3. Kilometraj",
    colValue: "Valoare",
    odomStart: "Km la predare (odometru la plecare)",
    odomEnd: "Km la returnare (odometru la sosire)",
    kmTrip: "Km parcursi in aceasta deplasare",
    sec4: "4. Confirmare si semnaturi",
    sigDriver: "Conducator auto",
    sigManager: "Responsabil flota",
    sigApproved: "Verificat / Aprobat",
    sigLine: "Semnatura",
    noteLabel: "Nota:",
    noteText: (startDate, endDate, tz) =>
      `Perioada rezervare: ${startDate} \u2013 ${endDate}. Timpii efectivi de preluare si returnare sunt inregistrati automat de sistem la momentul actionarii butoanelor din aplicatie. Ora afisata corespunde fusului orar al utilizatorului (${tz}). Datele provin din sistemul de rezervari FleetShare. Pastrati acest document pentru justificarea cheltuielilor conform legislatiei fiscale in vigoare.`,
  },
};

// ── Date helpers ──────────────────────────────────────────────────────────────
function fmtDt(d, tz) {
  if (!d) return "\u2014";
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "\u2014";
  try {
    return x.toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short", timeZone: tz });
  } catch {
    return x.toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
  }
}

function fmtDate(d, tz) {
  if (!d) return "\u2014";
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "\u2014";
  try {
    return x.toLocaleDateString("ro-RO", { timeZone: tz });
  } catch {
    return x.toLocaleDateString("ro-RO");
  }
}

function fmtDuration(from, to) {
  if (!from || !to) return "\u2014";
  const a = from instanceof Date ? from : new Date(from);
  const b = to instanceof Date ? to : new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "\u2014";
  const diffMs = b.getTime() - a.getTime();
  if (diffMs < 0) return "\u2014";
  const totalMin = Math.round(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${m} min`;
}

function loadLogoDataUrl() {
  try {
    const logoPath = path.join(process.cwd(), "public", "icon-512.png");
    const buf = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function drawSignatureBox(doc, x, y, w, h, label, sigLineLabel) {
  doc.setDrawColor(180, 190, 205);
  doc.setLineWidth(0.4);
  doc.roundedRect(x, y, w, h, 2, 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...GREY);
  doc.text(label, x + w / 2, y + 6, { align: "center" });
  doc.setDrawColor(160, 174, 192);
  doc.setLineWidth(0.3);
  const lineY = y + h - 8;
  doc.line(x + 6, lineY, x + w - 6, lineY);
  doc.setFontSize(7);
  doc.text(sigLineLabel, x + w / 2, y + h - 3, { align: "center" });
}

function drawInfoBadge(doc, x, y, label, value, bgColor) {
  const pageW = doc.internal.pageSize.getWidth();
  const w = (pageW - 28 - 4) / 2;
  doc.setFillColor(...bgColor);
  doc.roundedRect(x, y, w, 18, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...GREY);
  doc.text(label.toUpperCase(), x + 6, y + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(String(value || "\u2014"), x + 6, y + 14);
}

/**
 * @param {Object} p
 * @param {string} p.companyName
 * @param {string} p.driverName
 * @param {string} p.driverEmail
 * @param {string} p.vehicleLabel
 * @param {string} p.registrationNumber
 * @param {string} [p.vehicleCategory]
 * @param {string} [p.purpose]
 * @param {Date|string} p.startDate
 * @param {Date|string} p.endDate
 * @param {Date|string} [p.pickedUpAt]
 * @param {Date|string} [p.releasedAt]
 * @param {number} [p.releasedKmUsed]
 * @param {number} [p.releasedOdometerStart]
 * @param {number} [p.releasedOdometerEnd]
 * @param {Date} [p.generatedAt]
 * @param {string} [p.reservationId]
 * @param {string} [p.tz]   IANA timezone, e.g. "Europe/Bucharest"
 * @param {"en"|"ro"} [p.lang]
 * @returns {Buffer}
 */
export function buildJourneySheetPdf(p) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const logoDataUrl = loadLogoDataUrl();

  const tz = p.tz || "Europe/Bucharest";
  const t = T[p.lang === "ro" ? "ro" : "en"];
  const generatedOn = `${t.generated}: ${fmtDt(p.generatedAt || new Date(), tz)}`;
  const hasActualTimes = !!(p.pickedUpAt || p.releasedAt);

  let y = drawPdfHeader(doc, {
    title: t.title,
    subtitle: `${p.vehicleLabel || "\u2014"} \u00b7 ${p.registrationNumber || "\u2014"}`,
    company: { name: p.companyName || "" },
    generatedOn,
    logoDataUrl,
  });

  // ── Summary badges ────────────────────────────────────────────────────────
  const colLeft = 14;
  const colRight = 14 + (pageW - 28 - 4) / 2 + 4;

  drawInfoBadge(doc, colLeft, y, t.driver, p.driverName || "\u2014", LIGHT);
  drawInfoBadge(doc, colRight, y, t.vehicle, `${p.vehicleLabel || "\u2014"} | ${p.registrationNumber || "\u2014"}`, LIGHT);
  y += 22;

  drawInfoBadge(doc, colLeft, y, t.actualPickup, fmtDt(p.pickedUpAt || p.startDate, tz), GREEN_LIGHT);
  drawInfoBadge(doc, colRight, y, t.actualReturn, fmtDt(p.releasedAt || p.endDate, tz), ORANGE_LIGHT);
  y += 22;

  const duration = fmtDuration(p.pickedUpAt || p.startDate, p.releasedAt || p.endDate);
  const kmTotal = p.releasedKmUsed != null ? `${p.releasedKmUsed} km` : "\u2014";
  drawInfoBadge(doc, colLeft, y, t.totalDuration, duration, LIGHT);
  drawInfoBadge(doc, colRight, y, t.kmDriven, kmTotal, LIGHT);
  y += 26;

  // ── Section 1: Identification ─────────────────────────────────────────────
  y = checkPageBreak(doc, y, 60);
  y = addSectionTitle(doc, y, t.sec1);

  autoTable(doc, {
    startY: y,
    body: [
      [t.company, p.companyName || "\u2014"],
      [t.driverName, p.driverName || "\u2014"],
      [t.driverEmail, p.driverEmail || "\u2014"],
      [t.vehicleLabel, p.vehicleLabel || "\u2014"],
      [t.vehicleCategory, p.vehicleCategory || "\u2014"],
      [t.regNumber, p.registrationNumber || "\u2014"],
      [t.purpose, p.purpose || "\u2014"],
    ],
    theme: "plain",
    styles: {
      fontSize: 8.5,
      textColor: DARK,
      cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
    },
    columnStyles: {
      0: { fontStyle: "bold", textColor: GREY, cellWidth: 58 },
      1: { cellWidth: "auto" },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14, bottom: 20 },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ── Section 2: Trip period ────────────────────────────────────────────────
  y = checkPageBreak(doc, y, 55);
  y = addSectionTitle(doc, y, t.sec2);

  autoTable(doc, {
    startY: y,
    head: [[t.colIndicator, t.colPlanned, t.colActual]],
    body: [
      [t.plannedDep, fmtDt(p.startDate, tz), hasActualTimes ? fmtDt(p.pickedUpAt, tz) : "\u2014"],
      [t.plannedRet, fmtDt(p.endDate, tz), hasActualTimes ? fmtDt(p.releasedAt, tz) : "\u2014"],
    ],
    theme: "grid",
    headStyles: {
      fillColor: BLUE,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: DARK,
      cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 55 },
      1: { cellWidth: 65 },
      2: { cellWidth: 65 },
    },
    margin: { left: 14, right: 14, bottom: 20 },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ── Section 3: Mileage ────────────────────────────────────────────────────
  y = checkPageBreak(doc, y, 55);
  y = addSectionTitle(doc, y, t.sec3);

  autoTable(doc, {
    startY: y,
    head: [[t.colIndicator, t.colValue]],
    body: [
      [t.odomStart, p.releasedOdometerStart != null ? `${p.releasedOdometerStart.toLocaleString("ro-RO")} km` : "\u2014"],
      [t.odomEnd, p.releasedOdometerEnd != null ? `${p.releasedOdometerEnd.toLocaleString("ro-RO")} km` : "\u2014"],
      [t.kmTrip, p.releasedKmUsed != null ? `${p.releasedKmUsed.toLocaleString("ro-RO")} km` : "\u2014"],
    ],
    theme: "grid",
    headStyles: {
      fillColor: BLUE,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: DARK,
      cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 100 } },
    margin: { left: 14, right: 14, bottom: 20 },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ── Section 4: Signatures ─────────────────────────────────────────────────
  y = checkPageBreak(doc, y, 50);
  y = addSectionTitle(doc, y, t.sec4);

  const sigW = (pageW - 28 - 8) / 3;
  drawSignatureBox(doc, 14, y, sigW, 38, t.sigDriver, t.sigLine);
  drawSignatureBox(doc, 14 + sigW + 4, y, sigW, 38, t.sigManager, t.sigLine);
  drawSignatureBox(doc, 14 + (sigW + 4) * 2, y, sigW, 38, t.sigApproved, t.sigLine);
  y += 44;

  // ── Note ──────────────────────────────────────────────────────────────────
  y = checkPageBreak(doc, y, 25);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, y, pageW - 28, 22, 2, 2, "F");
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, y, pageW - 28, 22, 2, 2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...DARK);
  doc.text(t.noteLabel, 18, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GREY);
  doc.text(
    t.noteText(fmtDate(p.startDate, tz), fmtDate(p.endDate, tz), tz),
    18,
    y + 11,
    { maxWidth: pageW - 36 },
  );

  finalizePdfFooters(doc, p.companyName || "");

  const buf = doc.output("arraybuffer");
  return Buffer.from(buf);
}
