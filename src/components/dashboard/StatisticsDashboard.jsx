"use client";

import { useCallback, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Info } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchLogoDataUrl, drawPdfHeader, finalizePdfFooters, addSectionTitle, checkPageBreak } from "@/lib/pdf-report";
import FuelTypeBadge from "@/components/FuelTypeBadge";
import { fuelChartColor } from "@/lib/fuelTheme";
import { computeStatsForPeriod } from "@/lib/statistics-period";
import { useI18n } from "@/i18n/I18nProvider";
import LanguageCurrencySwitcher from "@/components/LanguageCurrencySwitcher";

const CO2_KG_PER_L_BENZINE = 2.31;
const CO2_KG_PER_L_DIESEL = 2.68;
const CO2_ELECTRIC_KG_PER_KWH = 0.2; // optional grid constant; use 0 for "0 direct"

/** CO₂ bars — dark blue (not black) */
const CO2_BAR_FILL = "#1e40af";
const CO2_BAR_ACTIVE = "#1d4ed8";

/** Car usage: min width per bar so many cars scroll horizontally */
const CAR_USAGE_PX_PER_CAR = 56;

function carBrandModel(c) {
  const m = [c.brand, c.model].filter(Boolean).join(" ").trim();
  return m || c.brand || "—";
}

const STATS_PERIODS = /** @type {const} */ (["7d", "30d", "6m", "1y"]);

export default function StatisticsDashboard({ reservations = [], company, users = [], cars = [] }) {
  const { t, formatCurrency, formatNumber, locale } = useI18n();

  const formatCarConsumption = useCallback(
    (c, defaultL100, defaultKwh100) => {
      const dec1 = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
      const ft = c.fuelType ?? "Benzine";
      const l100 = c.averageConsumptionL100km ?? defaultL100;
      const kwh = c.averageConsumptionKwh100km ?? defaultKwh100;
      if (ft === "Electric") return `${formatNumber(kwh, dec1)} kWh/100km`;
      if (ft === "Hybrid") return `${formatNumber(l100, dec1)} L + ${formatNumber(kwh, dec1)} kWh/100km`;
      return `${formatNumber(l100, dec1)} L/100km`;
    },
    [formatNumber]
  );
  const [statsPeriod, setStatsPeriod] = useState("30d");
  const priceBenzine = company?.priceBenzinePerLiter ?? company?.averageFuelPricePerLiter ?? 0;
  const priceDiesel = company?.priceDieselPerLiter ?? company?.averageFuelPricePerLiter ?? 0;
  const priceHybrid = company?.priceHybridPerLiter ?? 0;
  const priceElectricity = company?.priceElectricityPerKwh ?? 0;
  const fuelPrice = company?.averageFuelPricePerLiter ?? priceBenzine ?? 0;
  const hasFuelPrices =
    Boolean(priceBenzine || priceDiesel || priceHybrid || priceElectricity || fuelPrice);
  const defaultL100 = company?.defaultConsumptionL100km ?? 7.5;
  const defaultKwh100 = 20;
  const carMap = useMemo(() => Object.fromEntries((cars || []).map((c) => [c.id, c])), [cars]);

  const periodDeps = useMemo(() => {
    function getCar(carId) {
      return carMap[carId] ?? null;
    }
    function getL100ForCar(carId) {
      const car = getCar(carId);
      return car?.averageConsumptionL100km ?? defaultL100;
    }
    function getKwh100ForCar(carId) {
      const car = getCar(carId);
      return car?.averageConsumptionKwh100km ?? defaultKwh100;
    }
    function getFuelTypeForCar(carId) {
      const car = getCar(carId);
      return car?.fuelType ?? "Benzine";
    }
    function fuelCostForReservation(r) {
      const km = r.releasedKmUsed ?? 0;
      if (km <= 0) return 0;
      const carId = r.carId || r.car?.id;
      const car = getCar(carId);
      const ft = car?.fuelType ?? "Benzine";
      if (ft === "Electric") {
        const kwh100 = getKwh100ForCar(carId);
        return (km / 100) * kwh100 * (priceElectricity || 0);
      }
      if (ft === "Hybrid") {
        const l100 = getL100ForCar(carId);
        const kwh100 = getKwh100ForCar(carId);
        const hybridLitersPrice = priceHybrid || priceBenzine || priceDiesel || 0;
        const fuelPart = (km / 100) * l100 * hybridLitersPrice;
        const elecPart = (km / 100) * kwh100 * (priceElectricity || 0);
        return fuelPart + elecPart;
      }
      const l100 = getL100ForCar(carId);
      const price = ft === "Diesel" ? priceDiesel : priceBenzine;
      return (km / 100) * l100 * (price || 0);
    }
    function co2KgForReservation(r) {
      const km = r.releasedKmUsed ?? 0;
      if (km <= 0) return 0;
      const carId = r.carId || r.car?.id;
      const car = getCar(carId);
      const ft = car?.fuelType ?? "Benzine";
      if (ft === "Electric") return (km / 100) * getKwh100ForCar(carId) * CO2_ELECTRIC_KG_PER_KWH;
      if (ft === "Diesel") return (km / 100) * getL100ForCar(carId) * CO2_KG_PER_L_DIESEL;
      return (km / 100) * getL100ForCar(carId) * CO2_KG_PER_L_BENZINE;
    }
    return { fuelCostForReservation, co2KgForReservation, getFuelTypeForCar };
  }, [carMap, priceBenzine, priceDiesel, priceHybrid, priceElectricity, defaultL100, defaultKwh100]);

  const stats = useMemo(
    () =>
      computeStatsForPeriod(statsPeriod, {
        reservations,
        users,
        cars,
        ...periodDeps,
        carBrandModel,
        formatCarConsumption,
        defaultL100,
        defaultKwh100,
        t,
        locale,
      }),
    [statsPeriod, reservations, users, cars, periodDeps, defaultL100, defaultKwh100, t, locale, formatCarConsumption],
  );

  function buildStatsSnapshot(periodKey) {
    return computeStatsForPeriod(periodKey, {
      reservations,
      users,
      cars,
      ...periodDeps,
      carBrandModel,
      formatCarConsumption,
      defaultL100,
      defaultKwh100,
      t,
      locale,
    });
  }

  const handleDownloadPdf = async (periodKey) => {
    const s = buildStatsSnapshot(periodKey);
    const periodHuman = t(`stats.period.${periodKey}`);
    const locStr = locale === "ro" ? "ro-RO" : "en-GB";
    const logo = await fetchLogoDataUrl();

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const HEAD = { fillColor: [24, 95, 165], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 };
    const BODY = { fontSize: 8.5 };
    const ALT = { fillColor: [248, 250, 252] };
    const MARGIN = { left: 14, right: 14, bottom: 20 };

    const generatedOn = new Date().toLocaleString(locStr, { dateStyle: "short", timeStyle: "short" });
    let y = drawPdfHeader(doc, {
      title: t("stats.title"),
      subtitle: t("stats.pdfPeriodLine", { period: periodHuman }),
      company,
      generatedOn: t("stats.pdfGeneratedOn", { datetime: generatedOn }),
      logoDataUrl: logo,
    });

    y = addSectionTitle(doc, y, t("stats.pdfSummary"));
    autoTable(doc, {
      startY: y,
      head: [["Metric", "Value"]],
      body: [
        [t("stats.pdfActive"), String(s.activeCount)],
        [t("stats.pdfKmRange"), `${s.totalKmPeriod.toLocaleString(locStr)} km`],
        [t("stats.pdfEstCostRange"), hasFuelPrices ? formatCurrency(s.estimatedFuelCostPeriod) : t("stats.pdfNoPrice")],
        [t("stats.pdfCo2Range"), `${s.totalCo2Period.toFixed(1)} kg`],
      ],
      theme: "grid", headStyles: HEAD, bodyStyles: BODY, alternateRowStyles: ALT, margin: MARGIN,
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 80 } },
    });
    y = doc.lastAutoTable.finalY + 10;

    y = checkPageBreak(doc, y, 30);
    y = addSectionTitle(doc, y, t("stats.colRank") + " — " + t("stats.colName"));
    autoTable(doc, {
      startY: y,
      head: [[t("stats.colRank"), t("stats.colName"), t("stats.colEmail"), t("stats.colReservations")]],
      body: s.topUsers.map((u, i) => [i + 1, u.name, u.email, String(u.count)]),
      theme: "grid", headStyles: HEAD, bodyStyles: BODY, alternateRowStyles: ALT, margin: MARGIN,
    });
    y = doc.lastAutoTable.finalY + 10;

    y = checkPageBreak(doc, y, 30);
    y = addSectionTitle(doc, y, t("stats.pdfCostLeader"));
    autoTable(doc, {
      startY: y,
      head: [[t("stats.colRank"), t("stats.colMakeModel"), t("stats.colPlate"), t("stats.colCategory"), t("stats.colKm"), t("stats.colConsumption"), t("stats.colEstCost")]],
      body: s.efficiencyLeaderboard.map((row, i) => [
        i + 1, row.brandModel, row.registrationNumber, row.vehicleCategory || "OTHER",
        `${row.km.toLocaleString(locStr)} km`, row.consumptionDisplay,
        hasFuelPrices ? formatCurrency(row.fuelCost) : "—",
      ]),
      theme: "grid", headStyles: HEAD, bodyStyles: BODY, alternateRowStyles: ALT, margin: MARGIN,
    });
    y = doc.lastAutoTable.finalY + 10;

    y = checkPageBreak(doc, y, 30);
    y = addSectionTitle(doc, y, t("stats.pdfCarUsage"));
    autoTable(doc, {
      startY: y,
      head: [[t("stats.colMakeModel"), t("stats.colPlate"), t("stats.colKm"), t("stats.colReservations")]],
      body: s.carUsage.map((row) => [row.brandModel, `${row.plate} · ${row.vehicleCategory || "OTHER"}`, `${row.km.toLocaleString(locStr)} km`, String(row.reservations)]),
      theme: "grid", headStyles: HEAD, bodyStyles: BODY, alternateRowStyles: ALT, margin: MARGIN,
    });
    y = doc.lastAutoTable.finalY + 10;

    const totalFuelTrend = s.fuelTrend.reduce((acc, d) => acc + d.fuelCost, 0);
    if (hasFuelPrices && totalFuelTrend > 0) {
      y = checkPageBreak(doc, y, 15);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.text(`${t("stats.pdfFuelTrendTotal")}: ${formatCurrency(totalFuelTrend)}`, 16, y);
    }

    finalizePdfFooters(doc, company?.name);
    doc.save(`statistics-${periodKey}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <section className="w-full max-w-[1600px] min-w-0 mx-auto">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl sm:text-2xl font-bold text-[#1E293B]">{t("stats.title")}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mr-1">{t("stats.downloadReports")}</span>
            {STATS_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleDownloadPdf(p)}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-[#185FA5] text-white hover:bg-[#144a84] shadow-sm transition-colors"
              >
                {t("stats.downloadPdfFor", { period: t(`stats.periodShort.${p}`) })}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{t("stats.rangeLabel")}</p>
          <div
            className="inline-flex flex-wrap rounded-xl p-1 bg-slate-100 border border-slate-200/80"
            role="tablist"
            aria-label={t("stats.rangeLabel")}
          >
            {STATS_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={statsPeriod === p}
                onClick={() => setStatsPeriod(p)}
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  statsPeriod === p ? "bg-white text-[#185FA5] shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {t(`stats.period.${p}`)}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2 max-w-3xl">{t("stats.rangeHint")}</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <LanguageCurrencySwitcher variant="light" showLanguage={false} showCurrency />
          </div>
        </div>
      </div>

      {/* Top-level metric cards - Navy/Slate theme */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-6">
          <p className="text-sm font-medium text-slate-500 mb-1">{t("stats.activeReservations")}</p>
          <p className="text-2xl font-bold text-[#1E293B]">{stats.activeCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-6">
          <p className="text-sm font-medium text-slate-500 mb-1">{t("stats.mileagePeriod")}</p>
          <p className="text-xs text-slate-400 mb-1">{t(`stats.period.${statsPeriod}`)}</p>
          <p className="text-2xl font-bold text-[#1E293B]">
            {stats.totalKmPeriod.toLocaleString(locale === "ro" ? "ro-RO" : "en-GB")} km
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-6">
          <p className="text-sm font-medium text-slate-500 mb-1 flex items-center gap-1.5">
            {t("stats.estCostPeriod")}
            <span className="inline-flex text-slate-400 hover:text-slate-600 cursor-help" title={t("stats.costHint")}><Info className="w-4 h-4 shrink-0" /></span>
          </p>
          <p className="text-xs text-slate-400 mb-1">{t(`stats.period.${statsPeriod}`)}</p>
          <p className="text-2xl font-bold text-[#1E293B]">
            {hasFuelPrices ? formatCurrency(stats.estimatedFuelCostPeriod) : "—"}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-6">
          <p className="text-sm font-medium text-slate-500 mb-1 flex items-center gap-1.5">
            {t("stats.co2Period")}
            <span className="inline-flex text-slate-400 hover:text-slate-600 cursor-help" title={t("stats.co2Hint")}><Info className="w-4 h-4 shrink-0" /></span>
          </p>
          <p className="text-xs text-slate-400 mb-1">{t(`stats.period.${statsPeriod}`)}</p>
          <p className="text-2xl font-bold text-[#1E293B]">{stats.totalCo2Period.toFixed(1)} kg</p>
        </div>
      </div>

      {/* Unit prices (aligned with fuel colors) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-5 mb-8">
        <h3 className="text-sm font-semibold text-[#1E293B] mb-3">{t("stats.unitPricesTitle")}</h3>
        <p className="text-xs text-slate-500 mb-4">{t("stats.unitPricesSub")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { type: "Benzine", label: t("fuelTypes.benzine"), per: "liter", display: priceBenzine || fuelPrice },
            { type: "Diesel", label: t("fuelTypes.diesel"), per: "liter", display: priceDiesel || fuelPrice },
            { type: "Hybrid", label: t("fuelTypes.hybridIceLabel"), per: "liter", display: priceHybrid || priceBenzine || priceDiesel || fuelPrice },
            { type: "Electric", label: t("fuelTypes.electricitySupply"), per: "kwh", display: priceElectricity },
          ].map((row) => {
            const v = row.display;
            const show = typeof v === "number" && v > 0;
            const suffix = row.per === "kwh" ? t("common.perKwh") : t("common.perLiter");
            return (
              <div
                key={row.type}
                className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-slate-50/50"
                style={{ borderLeftWidth: 4, borderLeftColor: fuelChartColor(row.type) }}
              >
                <p className="text-xs font-medium text-slate-500">{row.label}</p>
                <p className="font-semibold text-[#1E293B] tabular-nums">
                  {show ? `${Number(v).toFixed(2)}${suffix}` : "—"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* CO2 chart */}
      <div className="w-full bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 mb-8">
        <h3 className="text-lg font-semibold text-[#1E293B] mb-4">
          {t("stats.co2ChartTitlePeriod", { period: t(`stats.period.${statsPeriod}`) })}
        </h3>
        <div className="w-full min-h-[260px]" style={{ height: 260 }}>
          {stats.co2ByDay.every((d) => d.co2Kg === 0) ? (
            <div className="h-full flex items-center justify-center text-slate-500 min-h-[260px]">
              {t("stats.co2EmptyPeriod", { period: t(`stats.period.${statsPeriod}`) })}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.co2ByDay} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 12 }} unit=" kg" />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }}
                  formatter={(v) => [`${v} kg CO₂`, t("stats.co2Tooltip")]}
                />
                <Bar
                  dataKey="co2Kg"
                  fill={CO2_BAR_FILL}
                  radius={[4, 4, 0, 0]}
                  name={t("stats.co2SeriesName")}
                  activeBar={{ fill: CO2_BAR_ACTIVE }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Fuel Efficiency Leaderboard (by consumption: most efficient first) */}
      <div className="w-full bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden mb-8">
        <h3 className="text-lg font-semibold text-[#1E293B] p-4 border-b border-slate-100">{t("stats.efficiencyTitle")}</h3>
        <p className="text-sm text-slate-500 px-4 pb-3">{t("stats.efficiencySub")}</p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colRank")}</th>
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colMakeModel")}</th>
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colPlate")}</th>
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colCategory")}</th>
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colFuel")}</th>
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colConsumption")}</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {stats.efficiencyByConsumption.length === 0 ? (
                <tr><td colSpan={6} className="py-10 px-4 text-center text-slate-500">{t("stats.noCars")}</td></tr>
              ) : (
                stats.efficiencyByConsumption.map((row, i) => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="py-4 px-4">{i + 1}</td>
                    <td className="py-4 px-4 font-medium">{row.brandModel}</td>
                    <td className="py-4 px-4 text-slate-600 tabular-nums">{row.registrationNumber}</td>
                    <td className="py-4 px-4 text-slate-600 tabular-nums">{row.vehicleCategory || "OTHER"}</td>
                    <td className="py-4 px-4">
                      <FuelTypeBadge fuelType={row.fuelType} />
                    </td>
                    <td className="py-4 px-4">{row.consumptionLabel}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fuel category: pie (car count) + bar (cost) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-lg font-semibold text-[#1E293B] mb-4">{t("stats.fleetFuelTitle")}</h3>
          <div className="w-full min-h-[260px]">
            {stats.fuelCategoryPie.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-slate-500">{t("stats.noCars")}</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={stats.fuelCategoryPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => `${e.name}: ${e.value}`}>
                    {stats.fuelCategoryPie.map((e) => <Cell key={e.name} fill={fuelChartColor(e.name)} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-lg font-semibold text-[#1E293B] mb-4">
          {t("stats.costFuelTitlePeriod", { period: t(`stats.period.${statsPeriod}`) })}
        </h3>
          <div className="w-full min-h-[260px]">
            {stats.costByFuelCategoryBar.every((d) => d.cost === 0) ? (
              <div className="h-[260px] flex items-center justify-center text-slate-500">{t("stats.noCostData")}</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.costByFuelCategoryBar} layout="vertical" margin={{ top: 10, right: 30, left: 60, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="fuelType" tick={{ fontSize: 12 }} width={72} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
                  <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                    {stats.costByFuelCategoryBar.map((e) => <Cell key={e.fuelType} fill={fuelChartColor(e.fuelType)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Range remaining (EV/Hybrid) + Maintenance due */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-lg font-semibold text-[#1E293B] mb-4">{t("stats.rangeTitle")}</h3>
          <p className="text-sm text-slate-500 mb-3">{t("stats.rangeFormula")}</p>
          {stats.rangeRemaining.length === 0 ? (
            <p className="text-slate-500">{t("stats.rangeEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {stats.rangeRemaining.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 justify-between py-2 border-b border-slate-100 last:border-0">
                  <span className="font-medium text-slate-800">{r.brandModel}</span>
                  <span className="text-slate-500 text-sm tabular-nums">{r.plate}</span>
                  <span className="text-[#1E293B] font-semibold">{r.rangeKm} km</span>
                  <span className="text-xs text-slate-500">({t("stats.batSuffix", { level: r.batteryLevel })})</span>
                  <FuelTypeBadge fuelType={r.fuelType} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-lg font-semibold text-[#1E293B] mb-4">{t("stats.serviceTitle")}</h3>
          <p className="text-sm text-slate-500 mb-3">{t("stats.serviceSub")}</p>
          {stats.maintenanceDue.length === 0 ? (
            <p className="text-slate-500">{t("stats.serviceEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {stats.maintenanceDue.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 justify-between py-2 border-b border-slate-100 last:border-0">
                  <span className="font-medium text-slate-800">{c.brandModel}</span>
                  <span className="text-slate-500 text-sm tabular-nums">{c.plate}</span>
                  <FuelTypeBadge fuelType={c.fuelType} />
                  <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">{t("stats.serviceDueBadge")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Efficiency Leaderboard (by fuel cost - original) */}
      <div className="w-full bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden mb-8">
        <h3 className="text-lg font-semibold text-[#1E293B] p-4 border-b border-slate-100">{t("stats.costLeaderTitle")}</h3>
        <p className="text-sm text-slate-500 px-4 pb-3">
          {t("stats.costLeaderSubPeriod", { period: t(`stats.period.${statsPeriod}`) })}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colRank")}</th>
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colMakeModel")}</th>
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colPlate")}</th>
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colCategory")}</th>
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colFuelShort")}</th>
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colKm")}</th>
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colConsumption")}</th>
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colEstCost")}</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {stats.efficiencyLeaderboard.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 px-4 text-center text-slate-500">{t("stats.noData")}</td>
                </tr>
              ) : (
                stats.efficiencyLeaderboard.map((row, i) => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 px-4">{i + 1}</td>
                    <td className="py-4 px-4 font-medium">{row.brandModel}</td>
                    <td className="py-4 px-4 text-slate-600 tabular-nums">{row.registrationNumber}</td>
                    <td className="py-4 px-4 text-slate-600 tabular-nums">{row.vehicleCategory || "OTHER"}</td>
                    <td className="py-4 px-4"><FuelTypeBadge fuelType={row.fuelType} /></td>
                    <td className="py-4 px-4">{row.km.toLocaleString(locale === "ro" ? "ro-RO" : "en-GB")} km</td>
                    <td className="py-4 px-4">{row.consumptionDisplay}</td>
                    <td className="py-4 px-4">
                      {hasFuelPrices ? formatCurrency(row.fuelCost) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top users table */}
      <div className="w-full bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden mb-8">
        <h3 className="text-lg font-semibold text-slate-800 p-4 border-b border-slate-100">{t("stats.topUsersTitle")}</h3>
        <p className="text-sm text-slate-500 px-4 pb-2">{t("stats.topUsersSubPeriod", { period: t(`stats.period.${statsPeriod}`) })}</p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colRank")}</th>
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colName")}</th>
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colEmail")}</th>
                <th className="py-4 px-4 font-semibold text-slate-700">{t("stats.colReservations")}</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {stats.topUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 px-4 text-center text-slate-500">{t("stats.noData")}</td>
                </tr>
              ) : (
                stats.topUsers.map((u, i) => (
                  <tr key={u.userId} className="border-t border-slate-100 hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 px-4">{i + 1}</td>
                    <td className="py-4 px-4">{u.name}</td>
                    <td className="py-4 px-4">{u.email}</td>
                    <td className="py-4 px-4 font-medium">{u.count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Car usage bar chart (horizontal scroll when many cars) */}
      <div className="w-full bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 mb-8">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">{t("stats.carUsageTitle")}</h3>
        <div className="w-full min-h-[300px]" style={{ height: 300 }}>
          {stats.carUsage.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 min-h-[300px]">{t("stats.carUsageEmpty")}</div>
          ) : (
            <div
              className="h-[300px] w-full overflow-x-auto overflow-y-hidden rounded-lg border border-slate-100/80 bg-slate-50/30"
              style={{ scrollbarGutter: "stable" }}
            >
              <div
                className="h-full"
                style={{
                  width: `max(100%, ${stats.carUsage.length * CAR_USAGE_PX_PER_CAR}px)`,
                  minWidth: "100%",
                }}
              >
                <ResponsiveContainer width="100%" height={300} minHeight={300}>
                  <BarChart
                    data={stats.carUsage}
                    margin={{ top: 10, right: 16, left: 8, bottom: 56 }}
                    barCategoryGap="12%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="plate"
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      angle={-30}
                      textAnchor="end"
                      height={52}
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 12 }} width={44} />
                    <Tooltip
                      cursor={{ fill: "rgba(24, 95, 165, 0.08)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        const car = carMap[d.id];
                        const locStr = locale === "ro" ? "ro-RO" : "en-GB";
                        const odo = car?.km != null ? `${Number(car.km).toLocaleString(locStr)} km` : null;
                        return (
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-lg max-w-xs">
                            <p className="font-semibold text-[#1E293B] leading-snug">{d.brandModel}</p>
                            <p className="text-sm text-slate-600 tabular-nums mt-0.5">{d.plate}</p>
                            {car?.fuelType ? (
                              <div className="mt-2">
                                <FuelTypeBadge fuelType={car.fuelType} />
                              </div>
                            ) : null}
                            <dl className="mt-2 space-y-1 text-sm text-slate-700">
                              <div className="flex justify-between gap-4">
                                <dt className="text-slate-500">{t("stats.chartKmDriven")}</dt>
                                <dd className="font-medium tabular-nums">{Number(d.km).toLocaleString(locStr)} km</dd>
                              </div>
                              <div className="flex justify-between gap-4">
                                <dt className="text-slate-500">{t("stats.colReservations")}</dt>
                                <dd className="font-medium tabular-nums">{d.reservations}</dd>
                              </div>
                              {odo ? (
                                <div className="flex justify-between gap-4">
                                  <dt className="text-slate-500">{t("stats.carUsageOdometer")}</dt>
                                  <dd className="font-medium tabular-nums">{odo}</dd>
                                </div>
                              ) : null}
                              {car?.status ? (
                                <div className="flex justify-between gap-4">
                                  <dt className="text-slate-500">{t("stats.carUsageStatus")}</dt>
                                  <dd className="font-medium text-slate-800">{car.status}</dd>
                                </div>
                              ) : null}
                            </dl>
                          </div>
                        );
                      }}
                    />
                    <Bar
                      dataKey="km"
                      fill="#185FA5"
                      radius={[4, 4, 0, 0]}
                      name={t("stats.chartKmDriven")}
                      activeBar={{ fill: "#124a87" }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fuel expenditure line chart (last 30 days) */}
      <div className="w-full bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">
          {t("stats.fuelTrendTitlePeriod", { period: t(`stats.period.${statsPeriod}`) })}
        </h3>
        <div className="w-full min-h-[280px]" style={{ height: 280 }}>
          {!hasFuelPrices ? (
            <div className="h-full flex items-center justify-center text-slate-500 min-h-[280px]">{t("stats.fuelTrendNoPrice")}</div>
          ) : stats.fuelTrend.every((d) => d.fuelCost === 0) ? (
            <div className="h-full flex items-center justify-center text-slate-500 min-h-[280px]">
              {t("stats.fuelTrendEmptyPeriod", { period: t(`stats.period.${statsPeriod}`) })}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280} minHeight={280}>
              <LineChart data={stats.fuelTrend} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }}
                  formatter={(value, name) => [
                    name === "fuelCost" ? formatCurrency(Number(value)) : value,
                    name === "fuelCost" ? t("stats.chartFuelCost") : t("stats.chartKm"),
                  ]}
                />
                <Legend />
                <Line type="monotone" dataKey="fuelCost" stroke="#185FA5" strokeWidth={2} dot={{ r: 2 }} name={t("stats.chartFuelCost")} />
                <Line type="monotone" dataKey="km" stroke="#64748B" strokeWidth={2} dot={{ r: 2 }} name={t("stats.chartKm")} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}
