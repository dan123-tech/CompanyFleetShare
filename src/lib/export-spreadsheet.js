/**
 * Fleet management Excel/CSV export using SheetJS (xlsx).
 * Produces a multi-sheet workbook with:
 *   1. Reservations  – one row per completed reservation
 *   2. Km by Car     – monthly km totals per vehicle
 *   3. Fuel Costs    – estimated cost per reservation
 *   4. Maintenance   – one row per maintenance event
 */
import * as XLSX from "xlsx";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(raw) {
  if (!raw) return "";
  try { return new Date(raw).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }); }
  catch { return String(raw); }
}

function fmtDateOnly(raw) {
  if (!raw) return "";
  try { return new Date(raw).toLocaleDateString("en-GB", { dateStyle: "short" }); }
  catch { return String(raw); }
}

function monthKey(raw) {
  if (!raw) return "";
  try { const d = new Date(raw); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
  catch { return ""; }
}

function carLabel(car) {
  if (!car) return "—";
  return [[car.brand, car.model].filter(Boolean).join(" ").trim(), car.registrationNumber].filter(Boolean).join(" · ");
}

function userLabel(user) {
  if (!user) return "—";
  return user.name || user.email || "—";
}

/**
 * Estimates fuel cost for one reservation.
 * Returns 0 if company prices are not configured.
 */
function calcFuelCost(r, car, company) {
  const km = r.releasedKmUsed ?? 0;
  if (km <= 0 || !car || !company) return 0;
  const ft = car.fuelType ?? "Benzine";
  const l100 = car.averageConsumptionL100km ?? company.defaultConsumptionL100km ?? 7.5;
  const kwh100 = car.averageConsumptionKwh100km ?? 20;
  const pB = company.priceBenzinePerLiter ?? company.averageFuelPricePerLiter ?? 0;
  const pD = company.priceDieselPerLiter ?? company.averageFuelPricePerLiter ?? 0;
  const pH = company.priceHybridPerLiter ?? pB ?? 0;
  const pE = company.priceElectricityPerKwh ?? 0;
  if (ft === "Electric") return (km / 100) * kwh100 * pE;
  if (ft === "Hybrid") return (km / 100) * l100 * pH + (km / 100) * kwh100 * pE;
  return (km / 100) * l100 * (ft === "Diesel" ? pD : pB);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet builders
// ─────────────────────────────────────────────────────────────────────────────

function buildReservationsSheet(reservations, users, cars) {
  const userMap = Object.fromEntries((users || []).map((u) => [u.id || u.userId, u]));
  const carMap  = Object.fromEntries((cars  || []).map((c) => [c.id, c]));

  const header = [
    "Reservation ID", "Status", "Driver", "Email",
    "Vehicle", "Plate", "Fuel Type",
    "Planned Start", "Planned End",
    "Actual Pickup", "Actual Release",
    "Duration (h)", "KM Used", "Purpose",
  ];

  const rows = (reservations || []).map((r) => {
    const u  = userMap[r.userId  || r.user?.id];
    const c  = carMap [r.carId   || r.car?.id];
    const start   = r.pickedUpAt  || r.startDate;
    const end     = r.releasedAt  || r.endDate;
    const durH    = (start && end)
      ? ((new Date(end) - new Date(start)) / 3_600_000).toFixed(2)
      : "";
    return [
      r.id, r.status,
      userLabel(u), u?.email || "",
      carLabel(c), c?.registrationNumber || "",
      c?.fuelType || "",
      fmtDate(r.startDate), fmtDate(r.endDate),
      fmtDate(r.pickedUpAt), fmtDate(r.releasedAt),
      durH,
      r.releasedKmUsed ?? "",
      r.purpose || "",
    ];
  });

  return XLSX.utils.aoa_to_sheet([header, ...rows]);
}

function buildKmByCarSheet(reservations, cars) {
  const carMap = Object.fromEntries((cars || []).map((c) => [c.id, c]));

  // Collect all months present in data
  const monthSet = new Set();
  for (const r of reservations || []) {
    if (r.releasedKmUsed > 0) monthSet.add(monthKey(r.releasedAt || r.updatedAt));
  }
  const months = [...monthSet].filter(Boolean).sort();

  // Group km by carId + month
  const byCarMonth = {};
  for (const r of reservations || []) {
    if (!r.releasedKmUsed) continue;
    const cid  = r.carId || r.car?.id || "?";
    const mon  = monthKey(r.releasedAt || r.updatedAt);
    if (!mon) continue;
    if (!byCarMonth[cid]) byCarMonth[cid] = {};
    byCarMonth[cid][mon] = (byCarMonth[cid][mon] || 0) + r.releasedKmUsed;
  }

  const header = ["Vehicle", "Plate", "Fuel Type", "Total KM", ...months];
  const rows = Object.entries(byCarMonth).map(([cid, mmap]) => {
    const c = carMap[cid];
    const total = Object.values(mmap).reduce((s, v) => s + v, 0);
    return [carLabel(c), c?.registrationNumber || "", c?.fuelType || "", total, ...months.map((m) => mmap[m] ?? 0)];
  }).sort((a, b) => (b[3] ?? 0) - (a[3] ?? 0));

  return XLSX.utils.aoa_to_sheet([header, ...rows]);
}

function buildFuelCostsSheet(reservations, cars, company) {
  const carMap = Object.fromEntries((cars || []).map((c) => [c.id, c]));

  const header = [
    "Reservation ID", "Date", "Vehicle", "Plate", "Fuel Type",
    "KM Used", "Consumption (L or kWh / 100km)", "Est. Fuel Cost",
  ];

  const rows = (reservations || [])
    .filter((r) => (r.releasedKmUsed ?? 0) > 0)
    .map((r) => {
      const c    = carMap[r.carId || r.car?.id];
      const cost = calcFuelCost(r, c, company);
      const l100 = c?.averageConsumptionL100km ?? company?.defaultConsumptionL100km ?? 7.5;
      const kwh  = c?.averageConsumptionKwh100km ?? 20;
      const cons = c?.fuelType === "Electric"
        ? `${kwh} kWh/100km`
        : c?.fuelType === "Hybrid"
        ? `${l100} L + ${kwh} kWh/100km`
        : `${l100} L/100km`;
      return [
        r.id,
        fmtDate(r.releasedAt || r.updatedAt),
        carLabel(c), c?.registrationNumber || "", c?.fuelType || "",
        r.releasedKmUsed ?? 0,
        cons,
        Number(cost.toFixed(2)),
      ];
    });

  return XLSX.utils.aoa_to_sheet([header, ...rows]);
}

function buildMaintenanceSheet(maintenanceEvents, cars) {
  const carMap = Object.fromEntries((cars || []).map((c) => [c.id, c]));

  const header = [
    "ID", "Vehicle", "Plate", "Service Type", "Date",
    "Odometer (km)", "Cost", "Notes",
  ];

  const rows = (maintenanceEvents || []).map((e) => {
    const c = carMap[e.carId];
    return [
      e.id || "",
      carLabel(c), c?.registrationNumber || "",
      e.serviceType || e.type || "",
      fmtDateOnly(e.performedAt || e.date),
      e.mileage ?? e.odometer ?? "",
      e.cost ?? "",
      e.notes || e.description || "",
    ];
  });

  return XLSX.utils.aoa_to_sheet([header, ...rows]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply basic column widths to make the sheet readable
// ─────────────────────────────────────────────────────────────────────────────
function autoColWidths(ws) {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const widths = [];
  for (let C = range.s.c; C <= range.e.c; C++) {
    let maxLen = 10;
    for (let R = range.s.r; R <= range.e.r; R++) {
      const cell = ws[XLSX.utils.encode_cell({ c: C, r: R })];
      if (cell && cell.v != null) {
        const len = String(cell.v).length;
        if (len > maxLen) maxLen = len;
      }
    }
    widths.push({ wch: Math.min(maxLen + 2, 40) });
  }
  ws["!cols"] = widths;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Triggers a browser download of a multi-sheet Excel (.xlsx) file.
 *
 * @param {{ reservations, maintenanceEvents, cars, users, company, companyName? }} params
 */
export function downloadFleetExcel({ reservations, maintenanceEvents, cars, users, company, companyName }) {
  const wb = XLSX.utils.book_new();

  const wsRes  = buildReservationsSheet(reservations, users, cars);
  const wsKm   = buildKmByCarSheet(reservations, cars);
  const wsFuel = buildFuelCostsSheet(reservations, cars, company);
  const wsMnt  = buildMaintenanceSheet(maintenanceEvents, cars);

  autoColWidths(wsRes);
  autoColWidths(wsKm);
  autoColWidths(wsFuel);
  autoColWidths(wsMnt);

  XLSX.utils.book_append_sheet(wb, wsRes,  "Reservations");
  XLSX.utils.book_append_sheet(wb, wsKm,   "Km by Car");
  XLSX.utils.book_append_sheet(wb, wsFuel, "Fuel Costs");
  XLSX.utils.book_append_sheet(wb, wsMnt,  "Maintenance");

  const safeCompany = (companyName || "fleet").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
  const date        = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `fleet-export-${safeCompany}-${date}.xlsx`);
}

/**
 * Triggers a browser download of a CSV file (reservations only).
 *
 * @param {{ reservations, users, cars }} params
 */
export function downloadFleetCsv({ reservations, users, cars, companyName }) {
  const ws = buildReservationsSheet(reservations, users, cars);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  const safeCompany = (companyName || "fleet").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
  a.download = `reservations-${safeCompany}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
