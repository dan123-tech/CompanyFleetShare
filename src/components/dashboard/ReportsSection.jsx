"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Car,
  CalendarRange,
  Wrench,
  LayoutList,
  FileDown,
  Loader2,
  Info,
  BarChart2,
  TableIcon,
  Sheet,
} from "lucide-react";
import { apiMaintenanceList, apiIncidentsList } from "@/lib/api";
import {
  generateCarReport,
  generateCarPeriodReport,
  generateCarMaintenanceReport,
  generateCompleteFleetReport,
  generateMonthlyCostReport,
} from "@/lib/pdf-report";
import { downloadFleetExcel, downloadFleetCsv } from "@/lib/export-spreadsheet";
import { useI18n } from "@/i18n/I18nProvider";

const REPORT_TYPES = [
  {
    id: "per-car",
    label: "Per Vehicle Report",
    description: "Full history for a single vehicle — all reservations, maintenance and incidents.",
    icon: Car,
    needsCar: true,
    needsPeriod: false,
  },
  {
    id: "per-car-period",
    label: "Vehicle + Period Report",
    description: "Reservations and maintenance for one vehicle within a chosen date range.",
    icon: CalendarRange,
    needsCar: true,
    needsPeriod: true,
  },
  {
    id: "per-car-maintenance",
    label: "Vehicle Maintenance Report",
    description: "Detailed maintenance history and cost breakdown for a single vehicle.",
    icon: Wrench,
    needsCar: true,
    needsPeriod: false,
  },
  {
    id: "complete",
    label: "Complete Fleet Report",
    description: "Fleet-wide overview: all vehicles, top drivers, maintenance and incidents summary.",
    icon: LayoutList,
    needsCar: false,
    needsPeriod: false,
  },
  {
    id: "monthly-cost",
    label: "Monthly Cost Report",
    description: "Fuel & maintenance costs grouped by month — per vehicle and per driver.",
    icon: TableIcon,
    needsCar: false,
    needsPeriod: false,
  },
];

function carDisplayLabel(car) {
  const bm = [car.brand, car.model].filter(Boolean).join(" ").trim() || car.brand || "Vehicle";
  return car.registrationNumber ? `${bm} · ${car.registrationNumber}` : bm;
}

export default function ReportsSection({ cars = [], reservations = [], users = [], company, onNavigateToStatistics }) {
  const { formatCurrency, locale } = useI18n();

  const [reportType, setReportType] = useState("per-car");
  const [selectedCarId, setSelectedCarId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const [maintenanceEvents, setMaintenanceEvents] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDataLoading(true);
      try {
        const [maint, incs] = await Promise.all([
          apiMaintenanceList().catch(() => []),
          apiIncidentsList().catch(() => []),
        ]);
        if (!cancelled) {
          setMaintenanceEvents(Array.isArray(maint) ? maint : []);
          setIncidents(Array.isArray(incs) ? incs : []);
        }
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const formatDate = useCallback(
    (d) => {
      if (!d) return "—";
      const ls = locale === "ro" ? "ro-RO" : "en-GB";
      return new Date(d).toLocaleString(ls, { dateStyle: "short", timeStyle: "short" });
    },
    [locale]
  );

  const currentType = REPORT_TYPES.find((t) => t.id === reportType);

  async function handleGenerate() {
    setError("");
    setGenerating(true);
    try {
      const ctx = { company, locale, formatCurrency, formatDate };

      if (reportType === "per-car") {
        const car = cars.find((c) => c.id === selectedCarId);
        if (!car) { setError("Please select a vehicle."); setGenerating(false); return; }
        const carRes = reservations.filter((r) => (r.carId || r.car?.id) === selectedCarId);
        const carMaint = maintenanceEvents.filter((e) => e.carId === selectedCarId);
        const carInc = incidents.filter((i) => i.carId === selectedCarId);
        await generateCarReport(car, carRes, carMaint, carInc, ctx);

      } else if (reportType === "per-car-period") {
        const car = cars.find((c) => c.id === selectedCarId);
        if (!car) { setError("Please select a vehicle."); setGenerating(false); return; }
        const carRes = reservations.filter((r) => {
          if ((r.carId || r.car?.id) !== selectedCarId) return false;
          const d = r.startDate ? r.startDate.slice(0, 10) : "";
          if (dateFrom && d < dateFrom) return false;
          if (dateTo && d > dateTo) return false;
          return true;
        });
        const carMaint = maintenanceEvents.filter((e) => {
          if (e.carId !== selectedCarId) return false;
          const d = e.performedAt ? e.performedAt.slice(0, 10) : "";
          if (dateFrom && d < dateFrom) return false;
          if (dateTo && d > dateTo) return false;
          return true;
        });
        await generateCarPeriodReport(car, carRes, carMaint, { ...ctx, dateFrom, dateTo });

      } else if (reportType === "per-car-maintenance") {
        const car = cars.find((c) => c.id === selectedCarId);
        if (!car) { setError("Please select a vehicle."); setGenerating(false); return; }
        const carMaint = maintenanceEvents.filter((e) => e.carId === selectedCarId);
        await generateCarMaintenanceReport(car, carMaint, ctx);

      } else if (reportType === "complete") {
        await generateCompleteFleetReport({
          cars, reservations, maintenanceEvents, incidents, users, ...ctx,
        });

      } else if (reportType === "monthly-cost") {
        await generateMonthlyCostReport({
          reservations, maintenanceEvents, cars, users, ...ctx,
        });
      }
    } catch (err) {
      console.error("Report generation failed:", err);
      setError("Failed to generate report. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  const canGenerate =
    !generating &&
    !dataLoading &&
    (!currentType?.needsCar || selectedCarId !== "");

  async function handleExport(format) {
    setExporting(true);
    setError("");
    try {
      const params = { reservations, maintenanceEvents, cars, users, company, companyName: company?.name };
      if (format === "xlsx") downloadFleetExcel(params);
      else downloadFleetCsv(params);
    } catch (err) {
      console.error("Export failed:", err);
      setError("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  const sortedCars = [...cars].sort((a, b) => {
    const la = carDisplayLabel(a).toLowerCase();
    const lb = carDisplayLabel(b).toLowerCase();
    return la < lb ? -1 : la > lb ? 1 : 0;
  });

  return (
    <section className="w-full min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#1E293B]">Reports</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Generate detailed PDF reports for any vehicle, period or the full fleet.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dataLoading && (
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading fleet data…
            </div>
          )}
          {onNavigateToStatistics && (
            <button
              type="button"
              onClick={onNavigateToStatistics}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
            >
              <BarChart2 className="w-4 h-4" />
              Open Statistics
            </button>
          )}
        </div>
      </div>

      {/* ── Export spreadsheet ── */}
      <div className="mb-6 max-w-3xl bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Export Data
        </p>
        <p className="text-sm text-slate-500 mb-4">
          Download the full fleet dataset as a spreadsheet — reservations, km logs, fuel costs and maintenance in one file.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={exporting || dataLoading}
            onClick={() => handleExport("xlsx")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sheet className="w-4 h-4" />}
            Download Excel (.xlsx)
          </button>
          <button
            type="button"
            disabled={exporting || dataLoading}
            onClick={() => handleExport("csv")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TableIcon className="w-4 h-4" />}
            Download CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 max-w-3xl">
        {/* ── Step 1: choose report type ── */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Step 1 — Choose report type
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {REPORT_TYPES.map((rt) => {
              const Icon = rt.icon;
              const active = reportType === rt.id;
              return (
                <button
                  key={rt.id}
                  type="button"
                  onClick={() => {
                    setReportType(rt.id);
                    setError("");
                  }}
                  className={`relative flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                    active
                      ? "border-[#185FA5] bg-blue-50 ring-2 ring-blue-200"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${
                      active ? "bg-[#185FA5] text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold leading-tight ${active ? "text-[#185FA5]" : "text-slate-800"}`}>
                      {rt.label}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">{rt.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Step 2: filters ── */}
        {(currentType?.needsCar || currentType?.needsPeriod) && (
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Step 2 — Filters
            </p>
            <div className="flex flex-col gap-4">
              {currentType.needsCar && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Vehicle <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedCarId}
                    onChange={(e) => { setSelectedCarId(e.target.value); setError(""); }}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-[#185FA5] focus:ring-2 focus:ring-blue-100 outline-none bg-white"
                  >
                    <option value="">— Select a vehicle —</option>
                    {sortedCars.map((car) => (
                      <option key={car.id} value={car.id}>
                        {carDisplayLabel(car)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {currentType.needsPeriod && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      From date
                    </label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-[#185FA5] focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      To date
                    </label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-[#185FA5] focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Generate button ── */}
        <div className="flex flex-col gap-3">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-[#185FA5] text-white font-semibold rounded-xl hover:bg-[#144a84] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors text-sm"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating PDF…
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4" />
                Generate &amp; Download PDF
              </>
            )}
          </button>

          {dataLoading && (
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading maintenance &amp; incident data…
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
