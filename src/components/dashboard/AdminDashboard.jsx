"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  BarChart2,
  Building2,
  Car,
  KeyRound,
  Users,
  Mail,
  History,
  CalendarDays,
  FileScan,
  Plus,
  ShieldCheck,
  Wrench,
  Download,
  Filter,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Sidebar, NavItem, NavSection, NavLabel } from "./Sidebar";
import FleetBookingCalendar from "./FleetBookingCalendar";
import AccessCodeQRButton, { ACCESS_CODE_SLOT_CLASS } from "./AccessCodeQRButton";
import StatisticsDashboard from "./StatisticsDashboard";
import FuelTypeBadge from "@/components/FuelTypeBadge";
import {
  apiCars,
  apiUsers,
  apiInvites,
  apiReservations,
  apiAddCar,
  apiUpdateCar,
  apiDeleteCar,
  apiInviteUser,
  apiCreateUser,
  apiUpdateUserRole,
  apiRemoveUser,
  apiUpdateCompanyCurrent,
  apiSetUserDrivingLicenceStatus,
  apiSetUserIdentityStatus,
  apiPendingExceededApprovals,
  apiSetExceededApproval,
  apiRefreshReservationCodes,
  apiVerifyPickupCode,
  apiDataSourceConfigGet,
  apiAiValidationConfigGet,
  apiAiValidationConfigPatch,
  apiMaintenanceList,
  apiMaintenanceCreate,
  apiMaintenanceDelete,
} from "@/lib/api";
import DataSourceNotConfiguredEmptyState from "./DataSourceNotConfiguredEmptyState";
import AuditLogsSection from "./AuditLogsSection";
import { getProviderLabelWithTable } from "@/orchestrator/config";
import { useI18n } from "@/i18n/I18nProvider";
import LanguageCurrencySwitcher from "@/components/LanguageCurrencySwitcher";

const ICON = { s: "w-4 h-4 shrink-0 stroke-[1.5]" };

const ADMIN_PAGE_META_KEYS = {
  company: "company",
  statistics: "statistics",
  cars: "cars",
  fleetCalendar: "fleetCalendar",
  verifyCode: "verifyCode",
  users: "users",
  invites: "invites",
  history: "history",
  aiVerification: "aiVerification",
  auditLogs: "auditLogs",
  maintenance: "maintenance",
};

function needsService(car) {
  const km = car.km ?? 0;
  const last = car.lastServiceMileage ?? 0;
  const fuelType = (car.fuelType || "Benzine").toLowerCase();
  if (fuelType === "electric") return { need: km > 0, type: "Battery check" };
  if (fuelType === "hybrid" || fuelType === "benzine" || fuelType === "diesel") {
    const since = km - last;
    return { need: since > 10000, type: "Oil change", since };
  }
  return { need: false, type: null };
}

const LAST_SERVICE_YM = /^\d{4}-(0[1-9]|1[0-2])$/;

/** @param {string|null|undefined} ym - "YYYY-MM" */
function formatLastServiceYearMonth(ym) {
  if (!ym || !LAST_SERVICE_YM.test(ym)) return null;
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

/** @param {Date} d */
function toYmdLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** @param {string} iso YYYY-MM-DD */
function maintDayStartMs(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/** @param {string} iso YYYY-MM-DD */
function maintDayEndMs(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

function CarConsumptionCell({ car, onUpdated }) {
  const { formatNumber } = useI18n();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(car.averageConsumptionL100km == null ? "" : String(car.averageConsumptionL100km));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setValue(car.averageConsumptionL100km == null ? "" : String(car.averageConsumptionL100km));
  }, [car.averageConsumptionL100km]);
  async function save() {
    const num = value.trim() === "" ? null : parseFloat(String(value).replace(",", "."));
    if (value.trim() !== "" && (Number.isNaN(num) || num < 0 || num > 30)) return;
    setSaving(true);
    try {
      await apiUpdateCar(car.id, { averageConsumptionL100km: num });
      onUpdated?.();
      setEditing(false);
    } catch {
      // keep editing
    } finally {
      setSaving(false);
    }
  }
  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={30}
          step={0.1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          onBlur={save}
          autoFocus
          className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
          placeholder="7.5"
        />
        {saving && <span className="text-xs text-slate-500">Saving…</span>}
      </div>
    );
  }
  const display = car.averageConsumptionL100km != null && car.averageConsumptionL100km !== ""
    ? Number(car.averageConsumptionL100km)
    : null;
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-left text-sm text-slate-700 hover:text-[var(--primary)] hover:underline"
      title="Click to edit"
    >
      {display != null
        ? `${formatNumber(display, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} L/100km`
        : "Default"}
    </button>
  );
}

export default function AdminDashboard({ user, company, onCompanyUpdated, viewAs, setViewAs }) {
  const { t, formatNumber, formatCurrency, locale } = useI18n();
  const [section, setSection] = useState("cars");
  const [cars, setCars] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddCar, setShowAddCar] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [addCarBrand, setAddCarBrand] = useState("");
  const [addCarReg, setAddCarReg] = useState("");
  const [addCarKm, setAddCarKm] = useState(0);
  const [addCarStatus, setAddCarStatus] = useState("AVAILABLE");
  const [addCarFuelType, setAddCarFuelType] = useState("Benzine");
  const [addCarConsumption, setAddCarConsumption] = useState("");
  const [addCarConsumptionKwh, setAddCarConsumptionKwh] = useState("");
  const [addCarBatteryLevel, setAddCarBatteryLevel] = useState("");
  const [addCarBatteryCapacityKwh, setAddCarBatteryCapacityKwh] = useState("");
  const [addCarLastServiceMileage, setAddCarLastServiceMileage] = useState("");
  const [addCarLastServiceMonth, setAddCarLastServiceMonth] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("USER");
  const [addUserPassword, setAddUserPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [invites, setInvites] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [defaultKmUsage, setDefaultKmUsage] = useState(company?.defaultKmUsage ?? 100);
  const [averageFuelPricePerLiter, setAverageFuelPricePerLiter] = useState(company?.averageFuelPricePerLiter ?? "");
  const [defaultConsumptionL100km, setDefaultConsumptionL100km] = useState(company?.defaultConsumptionL100km ?? "");
  const [priceBenzinePerLiter, setPriceBenzinePerLiter] = useState(company?.priceBenzinePerLiter ?? "");
  const [priceDieselPerLiter, setPriceDieselPerLiter] = useState(company?.priceDieselPerLiter ?? "");
  const [priceHybridPerLiter, setPriceHybridPerLiter] = useState(company?.priceHybridPerLiter ?? "");
  const [priceElectricityPerKwh, setPriceElectricityPerKwh] = useState(company?.priceElectricityPerKwh ?? "");
  const [defaultKmSaving, setDefaultKmSaving] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [pendingApprovalObservations, setPendingApprovalObservations] = useState({}); // reservationId -> text
  const [dlImageModal, setDlImageModal] = useState(null);
  const [refreshingCodeId, setRefreshingCodeId] = useState(null);
  const [verifyCodeInput, setVerifyCodeInput] = useState("");
  const [verifyBypass, setVerifyBypass] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifySubmitting, setVerifySubmitting] = useState(false);

  // Car Sharing History filters (all fields except start/end code)
  const [historyFilterCar, setHistoryFilterCar] = useState("");
  const [historyFilterUser, setHistoryFilterUser] = useState("");
  const [historyFilterDateFrom, setHistoryFilterDateFrom] = useState("");
  const [historyFilterDateTo, setHistoryFilterDateTo] = useState("");
  const [historyFilterStatus, setHistoryFilterStatus] = useState("");
  const [historyFilterPurpose, setHistoryFilterPurpose] = useState("");
  // Manage Cars filters
  const [carsFilterBrand, setCarsFilterBrand] = useState("");
  const [carsFilterReg, setCarsFilterReg] = useState("");
  const [carsFilterFuel, setCarsFilterFuel] = useState("");
  const [carsFilterStatus, setCarsFilterStatus] = useState("");
  // Manage Users filters
  const [usersFilterEmail, setUsersFilterEmail] = useState("");
  const [usersFilterName, setUsersFilterName] = useState("");
  const [usersFilterRole, setUsersFilterRole] = useState("");
  const [usersFilterStatus, setUsersFilterStatus] = useState("");
  const [usersFilterDl, setUsersFilterDl] = useState("");
  const [aiValidationConfig, setAiValidationConfig] = useState({
    drivingEnabled: true,
    faceEnabled: true,
  });
  const [aiConfigSaving, setAiConfigSaving] = useState(false);
  const [dataSourceConfig, setDataSourceConfig] = useState(null);
  const [dataSourceNotConfigured, setDataSourceNotConfigured] = useState({ users: false, cars: false, reservations: false });
  const [maintenanceEvents, setMaintenanceEvents] = useState([]);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintCarId, setMaintCarId] = useState("");
  const [maintPerformedAt, setMaintPerformedAt] = useState("");
  const [maintMileageKm, setMaintMileageKm] = useState("");
  const [maintServiceType, setMaintServiceType] = useState("");
  const [maintCost, setMaintCost] = useState("");
  const [maintNotes, setMaintNotes] = useState("");
  const [maintSaving, setMaintSaving] = useState(false);
  const [maintFilterCarId, setMaintFilterCarId] = useState("");
  const [maintFilterDateFrom, setMaintFilterDateFrom] = useState("");
  const [maintFilterDateTo, setMaintFilterDateTo] = useState("");
  const [maintFilterService, setMaintFilterService] = useState("");

  async function loadMaintenance() {
    setMaintenanceLoading(true);
    try {
      const list = await apiMaintenanceList();
      setMaintenanceEvents(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load maintenance");
    } finally {
      setMaintenanceLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    setError("");
    setDataSourceNotConfigured({ users: false, cars: false, reservations: false });
    try {
      const [configRes, carsRes, usersRes, invitesRes, reservRes, approvalsRes, aiCfgRes] = await Promise.all([
        apiDataSourceConfigGet().catch(() => ({ users: "LOCAL", cars: "LOCAL", reservations: "LOCAL" })),
        apiCars().catch((err) => ({ __error: err })),
        apiUsers().catch((err) => ({ __error: err })),
        apiInvites().catch(() => []),
        apiReservations().catch((err) => ({ __error: err })),
        apiPendingExceededApprovals().catch(() => []),
        apiAiValidationConfigGet().catch(() => ({ drivingEnabled: true, faceEnabled: true })),
      ]);
      if (configRes && !configRes.__error) setDataSourceConfig(configRes);
      if (carsRes?.__error) {
        const err = carsRes.__error;
        if (err.code === "DATA_SOURCE_NOT_CONFIGURED") setDataSourceNotConfigured((s) => ({ ...s, cars: true }));
        setError((e) => (e ? e : err?.message || "Failed to load cars"));
        setCars([]);
      } else setCars(Array.isArray(carsRes) ? carsRes : []);
      if (usersRes?.__error) {
        const err = usersRes.__error;
        if (err.code === "DATA_SOURCE_NOT_CONFIGURED") setDataSourceNotConfigured((s) => ({ ...s, users: true }));
        setError((e) => (e ? e : err?.message || "Failed to load users"));
        setUsers([]);
      } else setUsers(Array.isArray(usersRes) ? usersRes : []);
      setInvites(Array.isArray(invitesRes) ? invitesRes : []);
      if (reservRes?.__error) {
        const err = reservRes.__error;
        if (err.code === "DATA_SOURCE_NOT_CONFIGURED") setDataSourceNotConfigured((s) => ({ ...s, reservations: true }));
        setError((e) => (e ? e : err?.message || "Failed to load reservations"));
        setReservations([]);
      } else setReservations(Array.isArray(reservRes) ? reservRes : []);
      setPendingApprovals(Array.isArray(approvalsRes) ? approvalsRes : []);
      if (aiCfgRes && !aiCfgRes.__error) {
        setAiValidationConfig({
          drivingEnabled: aiCfgRes.drivingEnabled !== false,
          faceEnabled: aiCfgRes.faceEnabled !== false,
        });
      }
    } catch (err) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const handler = () => load();
    window.addEventListener("dataSourceConfigSaved", handler);
    return () => window.removeEventListener("dataSourceConfigSaved", handler);
  }, []);

  useEffect(() => {
    if (section === "maintenance") loadMaintenance();
  }, [section]);

  function formatDate(d) {
    if (!d) return "—";
    const x = new Date(d);
    return x.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  }

  async function handleRefreshCodes(reservationId) {
    setRefreshingCodeId(reservationId);
    setError("");
    try {
      await apiRefreshReservationCodes(reservationId);
      await load();
    } catch (err) {
      setError(err.message || "Failed to refresh codes");
    } finally {
      setRefreshingCodeId(null);
    }
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    const code = verifyCodeInput.trim();
    if (!code) return;
    setVerifySubmitting(true);
    setVerifyResult(null);
    setError("");
    try {
      const data = await apiVerifyPickupCode(code, verifyBypass);
      setVerifyResult({ valid: true, reservation: data.reservation });
    } catch (err) {
      setVerifyResult({ valid: false, error: err.message || "Verification failed" });
    } finally {
      setVerifySubmitting(false);
    }
  }

  const availableCars = cars.filter((c) => (c.status || "").toLowerCase() === "available");
  const totalCars = cars.length;
  const serviceDueCount = cars.filter((c) => needsService(c).need).length;
  const averageMileage =
    totalCars > 0
      ? Math.round(
          cars.reduce((sum, c) => sum + (typeof c.km === "number" ? c.km : 0), 0) / totalCars,
        )
      : 0;
  // Filtered lists
  const filteredHistory = reservations.filter((r) => {
    const carStr = [r.car?.brand, r.car?.registrationNumber].filter(Boolean).join(" ").toLowerCase();
    const userStr = [r.user?.name, r.user?.email].filter(Boolean).join(" ").toLowerCase();
    if (historyFilterCar && !carStr.includes(historyFilterCar.trim().toLowerCase())) return false;
    if (historyFilterUser && !userStr.includes(historyFilterUser.trim().toLowerCase())) return false;
    if (historyFilterDateFrom) {
      const start = r.startDate ? new Date(r.startDate).toISOString().slice(0, 10) : "";
      if (start < historyFilterDateFrom) return false;
    }
    if (historyFilterDateTo) {
      const start = r.startDate ? new Date(r.startDate).toISOString().slice(0, 10) : "";
      if (start > historyFilterDateTo) return false;
    }
    if (historyFilterStatus && (r.status || "").toLowerCase() !== historyFilterStatus.toLowerCase()) return false;
    if (historyFilterPurpose && !(r.purpose || "").toLowerCase().includes(historyFilterPurpose.trim().toLowerCase())) return false;
    return true;
  });

  const filteredCars = cars.filter((c) => {
    if (carsFilterBrand && !(c.brand || "").toLowerCase().includes(carsFilterBrand.trim().toLowerCase())) return false;
    if (carsFilterReg && !(c.registrationNumber || "").toLowerCase().includes(carsFilterReg.trim().toLowerCase())) return false;
    if (carsFilterFuel && (c.fuelType || "") !== carsFilterFuel) return false;
    if (carsFilterStatus && (c.status || "") !== carsFilterStatus) return false;
    return true;
  });

  const filteredUsers = users.filter((m) => {
    if (usersFilterEmail && !(m.email || "").toLowerCase().includes(usersFilterEmail.trim().toLowerCase())) return false;
    if (usersFilterName && !(m.name || "").toLowerCase().includes(usersFilterName.trim().toLowerCase())) return false;
    if (usersFilterRole && (m.role || "") !== usersFilterRole) return false;
    if (usersFilterStatus && (m.status || "") !== usersFilterStatus) return false;
    if (usersFilterDl) {
      const dl = (m.drivingLicenceStatus || "").toUpperCase();
      const want = usersFilterDl.toUpperCase();
      if (want === "NONE" && dl) return false;
      if (want !== "NONE" && dl !== want) return false;
    }
    return true;
  });

  const filteredMaintenanceEvents = useMemo(() => {
    let list = Array.isArray(maintenanceEvents) ? [...maintenanceEvents] : [];
    if (maintFilterCarId) list = list.filter((ev) => ev.carId === maintFilterCarId);
    const fromMs = maintDayStartMs(maintFilterDateFrom);
    const toMs = maintDayEndMs(maintFilterDateTo);
    if (fromMs != null) list = list.filter((ev) => new Date(ev.performedAt).getTime() >= fromMs);
    if (toMs != null) list = list.filter((ev) => new Date(ev.performedAt).getTime() <= toMs);
    const svc = maintFilterService.trim().toLowerCase();
    if (svc) list = list.filter((ev) => (ev.serviceType || "").toLowerCase().includes(svc));
    list.sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt));
    return list;
  }, [maintenanceEvents, maintFilterCarId, maintFilterDateFrom, maintFilterDateTo, maintFilterService]);

  const maintenanceStats = useMemo(() => {
    const events = Array.isArray(filteredMaintenanceEvents) ? filteredMaintenanceEvents : [];
    const now = Date.now();
    const ms12mo = 365 * 24 * 60 * 60 * 1000;
    const cutoff12 = now - ms12mo;

    let totalCost = 0;
    let costCount = 0;
    let totalCost12 = 0;
    let count12 = 0;
    const byCar = new Map();

    for (const ev of events) {
      const ts = new Date(ev.performedAt).getTime();
      if (ts >= cutoff12) count12 += 1;

      const c = ev.cost != null && !Number.isNaN(Number(ev.cost)) ? Number(ev.cost) : null;
      if (c != null) {
        totalCost += c;
        costCount += 1;
        if (ts >= cutoff12) totalCost12 += c;
      }

      const label = [ev.car?.brand, ev.car?.registrationNumber].filter(Boolean).join(" ").trim() || "—";
      const cur = byCar.get(ev.carId) || { carId: ev.carId, label, count: 0, costSum: 0 };
      cur.count += 1;
      if (c != null) cur.costSum += c;
      byCar.set(ev.carId, cur);
    }

    const topCars = [...byCar.values()].sort((a, b) => b.count - a.count).slice(0, 5);

    const monthBuckets = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const y = d.getFullYear();
      const m = d.getMonth();
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      monthBuckets.push({
        key,
        label: d.toLocaleString(undefined, { month: "short", year: "numeric" }),
        count: 0,
        cost: 0,
      });
    }
    for (const ev of events) {
      const d = new Date(ev.performedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bucket = monthBuckets.find((b) => b.key === key);
      if (bucket) {
        bucket.count += 1;
        const c = ev.cost != null && !Number.isNaN(Number(ev.cost)) ? Number(ev.cost) : null;
        if (c != null) bucket.cost += c;
      }
    }

    const yNow = new Date().getFullYear();
    const yearBuckets = [0, 1, 2].map((offset) => {
      const year = yNow - offset;
      let count = 0;
      let yTotalCost = 0;
      let yCostCount = 0;
      for (const ev of events) {
        if (new Date(ev.performedAt).getFullYear() !== year) continue;
        count++;
        const c = ev.cost != null && !Number.isNaN(Number(ev.cost)) ? Number(ev.cost) : null;
        if (c != null) {
          yTotalCost += c;
          yCostCount++;
        }
      }
      return {
        year,
        count,
        totalCost: yTotalCost,
        costCount: yCostCount,
        avgCost: yCostCount > 0 ? yTotalCost / yCostCount : null,
      };
    });

    return {
      totalEvents: events.length,
      totalCost,
      costCount,
      avgCost: costCount > 0 ? totalCost / costCount : null,
      countLast12Months: count12,
      totalCostLast12: totalCost12,
      topCars,
      monthBuckets,
      yearBuckets,
    };
  }, [filteredMaintenanceEvents]);

  const downloadMaintenanceCsv = useCallback(() => {
    const s = maintenanceStats;
    const events = Array.isArray(filteredMaintenanceEvents) ? filteredMaintenanceEvents : [];
    const csvCell = (v) => {
      const str = v == null ? "" : String(v);
      if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };
    const lines = [];
    lines.push(csvCell(t("maintenanceStats.title")));
    if (company?.name) lines.push(csvCell(company.name));
    lines.push("");
    lines.push(csvCell(t("maintenanceStats.csvSectionSummary")));
    lines.push(
      [csvCell(t("maintenanceStats.csvColMetric")), csvCell(t("maintenanceStats.csvColValue"))].join(","),
    );
    const summaryRows = [
      [t("maintenanceStats.totalRecords"), String(s.totalEvents)],
      [t("maintenanceStats.totalCost"), s.costCount > 0 ? formatCurrency(s.totalCost) : "—"],
      ...(s.costCount > 0 ? [[t("maintenanceStats.avgCost"), formatCurrency(s.avgCost)]] : []),
      [t("maintenanceStats.last12Title"), String(s.countLast12Months)],
      [t("maintenanceStats.costLabel"), s.totalCostLast12 > 0 ? formatCurrency(s.totalCostLast12) : "—"],
      [t("maintenanceStats.withCost"), `${s.costCount} / ${s.totalEvents}`],
    ];
    for (const [k, v] of summaryRows) {
      lines.push([csvCell(k), csvCell(v)].join(","));
    }
    lines.push("");
    lines.push(csvCell(t("maintenanceStats.byYearTitle")));
    lines.push(
      [
        csvCell(t("maintenanceStats.csvColYear")),
        csvCell(t("maintenanceStats.csvColRecords")),
        csvCell(t("maintenanceStats.csvColTotalCost")),
        csvCell(t("maintenanceStats.csvColRecordsWithCost")),
      ].join(","),
    );
    for (const yb of s.yearBuckets) {
      lines.push(
        [
          csvCell(String(yb.year)),
          csvCell(String(yb.count)),
          csvCell(yb.totalCost > 0 ? formatCurrency(yb.totalCost) : "—"),
          csvCell(String(yb.costCount)),
        ].join(","),
      );
    }
    lines.push("");
    lines.push(csvCell(t("maintenanceStats.csvSectionTopVehicles")));
    lines.push(
      [
        csvCell(t("maintenanceStats.csvColRank")),
        csvCell(t("maintenanceStats.csvColVehicle")),
        csvCell(t("maintenanceStats.csvColServiceCount")),
        csvCell(t("maintenanceStats.csvColVehicleCostTotal")),
      ].join(","),
    );
    s.topCars.forEach((row, idx) => {
      lines.push(
        [
          csvCell(String(idx + 1)),
          csvCell(row.label),
          csvCell(String(row.count)),
          csvCell(row.costSum > 0 ? formatCurrency(row.costSum) : "—"),
        ].join(","),
      );
    });
    lines.push("");
    lines.push(csvCell(t("maintenanceStats.csvSectionByMonth")));
    lines.push([csvCell(t("maintenanceStats.csvColMonth")), csvCell(t("maintenanceStats.csvColCount"))].join(","));
    for (const b of s.monthBuckets) {
      lines.push([csvCell(b.label), csvCell(String(b.count))].join(","));
    }
    lines.push("");
    lines.push(csvCell(t("maintenanceStats.csvSectionAllRecords")));
    lines.push(
      [
        csvCell(t("maintenanceStats.csvColDate")),
        csvCell(t("maintenanceStats.csvColVehicle")),
        csvCell(t("maintenanceStats.csvColService")),
        csvCell(t("maintenanceStats.csvColKm")),
        csvCell(t("maintenanceStats.csvColCost")),
        csvCell(t("maintenanceStats.csvColNotes")),
      ].join(","),
    );
    for (const ev of events) {
      const veh = [ev.car?.brand, ev.car?.registrationNumber].filter(Boolean).join(" ").trim() || "—";
      const cost =
        ev.cost != null && !Number.isNaN(Number(ev.cost)) ? formatCurrency(Number(ev.cost)) : "—";
      lines.push(
        [
          csvCell(formatDate(ev.performedAt)),
          csvCell(veh),
          csvCell(ev.serviceType || ""),
          csvCell(ev.mileageKm != null ? String(ev.mileageKm) : ""),
          csvCell(cost),
          csvCell(ev.notes || ""),
        ].join(","),
      );
    }
    const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${t("maintenanceStats.exportFilePrefix")}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [
    maintenanceStats,
    filteredMaintenanceEvents,
    company,
    t,
    formatCurrency,
    formatDate,
  ]);

  const downloadMaintenancePdf = useCallback(() => {
    const s = maintenanceStats;
    const events = Array.isArray(filteredMaintenanceEvents) ? filteredMaintenanceEvents : [];
    const locStr = locale === "ro" ? "ro-RO" : "en-GB";
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    let y = 14;
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(t("maintenanceStats.title"), 14, y);
    y += 8;
    if (company?.name) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(company.name, 14, y);
      y += 6;
    }
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(t("stats.pdfGeneratedOn", { datetime: new Date().toLocaleString(locStr) }), 14, y);
    y += 10;
    doc.setTextColor(0, 0, 0);

    doc.setFont("helvetica", "bold");
    doc.text(t("maintenanceStats.byYearTitle"), 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: y,
      head: [
        [
          t("maintenanceStats.csvColYear"),
          t("maintenanceStats.csvColRecords"),
          t("maintenanceStats.csvColTotalCost"),
          t("maintenanceStats.csvColRecordsWithCost"),
        ],
      ],
      body: s.yearBuckets.map((row) => [
        String(row.year),
        String(row.count),
        row.totalCost > 0 ? formatCurrency(row.totalCost) : "—",
        String(row.costCount),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [71, 85, 105] },
    });
    y = doc.lastAutoTable.finalY + 10;

    doc.setFont("helvetica", "bold");
    doc.text(t("maintenanceStats.csvSectionSummary"), 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: y,
      head: [[t("maintenanceStats.csvColMetric"), t("maintenanceStats.csvColValue")]],
      body: [
        [t("maintenanceStats.totalRecords"), String(s.totalEvents)],
        [
          t("maintenanceStats.totalCost"),
          s.costCount > 0 ? formatCurrency(s.totalCost) : "—",
        ],
        ...(s.costCount > 0 ? [[t("maintenanceStats.avgCost"), formatCurrency(s.avgCost)]] : []),
        [t("maintenanceStats.last12Title"), String(s.countLast12Months)],
        [
          t("maintenanceStats.costLabel"),
          s.totalCostLast12 > 0 ? formatCurrency(s.totalCostLast12) : "—",
        ],
        [t("maintenanceStats.withCost"), `${s.costCount} / ${s.totalEvents}`],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [71, 85, 105] },
    });
    y = doc.lastAutoTable.finalY + 10;

    doc.setFont("helvetica", "bold");
    doc.text(t("maintenanceStats.csvSectionTopVehicles"), 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: y,
      head: [
        [
          t("maintenanceStats.csvColRank"),
          t("maintenanceStats.csvColVehicle"),
          t("maintenanceStats.csvColServiceCount"),
          t("maintenanceStats.csvColVehicleCostTotal"),
        ],
      ],
      body: s.topCars.map((row, idx) => [
        String(idx + 1),
        row.label,
        String(row.count),
        row.costSum > 0 ? formatCurrency(row.costSum) : "—",
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [71, 85, 105] },
    });
    y = doc.lastAutoTable.finalY + 10;

    doc.setFont("helvetica", "bold");
    doc.text(t("maintenanceStats.csvSectionByMonth"), 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: y,
      head: [[t("maintenanceStats.csvColMonth"), t("maintenanceStats.csvColCount")]],
      body: s.monthBuckets.map((b) => [b.label, String(b.count)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [71, 85, 105] },
    });
    y = doc.lastAutoTable.finalY + 10;

    doc.setFont("helvetica", "bold");
    doc.text(t("maintenanceStats.csvSectionAllRecords"), 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: y,
      head: [
        [
          t("maintenanceStats.csvColDate"),
          t("maintenanceStats.csvColVehicle"),
          t("maintenanceStats.csvColService"),
          t("maintenanceStats.csvColKm"),
          t("maintenanceStats.csvColCost"),
          t("maintenanceStats.csvColNotes"),
        ],
      ],
      body: events.map((ev) => {
        const veh = [ev.car?.brand, ev.car?.registrationNumber].filter(Boolean).join(" ").trim() || "—";
        const cost =
          ev.cost != null && !Number.isNaN(Number(ev.cost)) ? formatCurrency(Number(ev.cost)) : "—";
        return [
          formatDate(ev.performedAt),
          veh,
          ev.serviceType || "—",
          ev.mileageKm != null ? String(ev.mileageKm) : "—",
          cost,
          (ev.notes || "").slice(0, 200),
        ];
      }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [71, 85, 105] },
    });

    doc.save(`${t("maintenanceStats.exportFilePrefix")}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }, [
    maintenanceStats,
    filteredMaintenanceEvents,
    company,
    t,
    formatCurrency,
    formatDate,
    locale,
  ]);

  async function saveCompanySettings(e) {
    e.preventDefault();
    const kmVal = parseInt(defaultKmUsage, 10);
    if (isNaN(kmVal) || kmVal < 1) {
      setError("Default km must be at least 1");
      return;
    }
    const toNum = (v) => (v === "" || v == null ? null : (() => { const n = parseFloat(String(v).replace(",", ".")); return Number.isNaN(n) ? null : n; })());
    const fuelVal = toNum(averageFuelPricePerLiter);
    if (fuelVal !== null && fuelVal < 0) {
      setError("Fuel price must be non-negative");
      return;
    }
    setDefaultKmSaving(true);
    setError("");
    try {
      await apiUpdateCompanyCurrent({
        defaultKmUsage: kmVal,
        averageFuelPricePerLiter: fuelVal,
        defaultConsumptionL100km: toNum(defaultConsumptionL100km) ?? undefined,
        priceBenzinePerLiter: toNum(priceBenzinePerLiter) ?? undefined,
        priceDieselPerLiter: toNum(priceDieselPerLiter) ?? undefined,
        priceHybridPerLiter: toNum(priceHybridPerLiter) ?? undefined,
        priceElectricityPerKwh: toNum(priceElectricityPerKwh) ?? undefined,
      });
      onCompanyUpdated?.();
      setError("");
    } catch (err) {
      setError(err.message || "Failed to save");
    } finally {
      setDefaultKmSaving(false);
    }
  }

  async function handleDlStatus(userId, status) {
    try {
      await apiSetUserDrivingLicenceStatus(userId, status);
      load();
    } catch (err) {
      setError(err.message || "Failed to update");
    }
  }

  async function handleIdentityStatus(userId, status) {
    try {
      await apiSetUserIdentityStatus(userId, status);
      load();
    } catch (err) {
      setError(err.message || "Failed to update");
    }
  }

  async function handleAiValidationToggle(key, value) {
    setAiConfigSaving(true);
    setError("");
    try {
      const payload = key === "drivingEnabled" ? { drivingEnabled: value } : { faceEnabled: value };
      const updated = await apiAiValidationConfigPatch(payload);
      setAiValidationConfig({
        drivingEnabled: updated.drivingEnabled !== false,
        faceEnabled: updated.faceEnabled !== false,
      });
    } catch (err) {
      setError(err.message || "Failed to save AI validation settings");
    } finally {
      setAiConfigSaving(false);
    }
  }

  async function setAiValidationMode(mode) {
    setAiConfigSaving(true);
    setError("");
    try {
      const payload =
        mode === "driving"
          ? { drivingEnabled: true, faceEnabled: false }
          : { drivingEnabled: false, faceEnabled: true };
      const updated = await apiAiValidationConfigPatch(payload);
      setAiValidationConfig({
        drivingEnabled: updated.drivingEnabled !== false,
        faceEnabled: updated.faceEnabled !== false,
      });
    } catch (err) {
      setError(err.message || "Failed to save AI validation settings");
    } finally {
      setAiConfigSaving(false);
    }
  }

  async function handleExceededApproval(reservationId, action) {
    const observations = pendingApprovalObservations[reservationId];
    try {
      await apiSetExceededApproval(reservationId, action, observations);
      setPendingApprovalObservations((prev) => {
        const next = { ...prev };
        delete next[reservationId];
        return next;
      });
      load();
    } catch (err) {
      setError(err.message || "Failed to update");
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (company?.defaultKmUsage != null) setDefaultKmUsage(company.defaultKmUsage);
    if (company?.averageFuelPricePerLiter !== undefined) setAverageFuelPricePerLiter(company.averageFuelPricePerLiter == null ? "" : String(company.averageFuelPricePerLiter));
    if (company?.defaultConsumptionL100km !== undefined) setDefaultConsumptionL100km(company.defaultConsumptionL100km == null ? "" : String(company.defaultConsumptionL100km));
    if (company?.priceBenzinePerLiter !== undefined) setPriceBenzinePerLiter(company.priceBenzinePerLiter == null ? "" : String(company.priceBenzinePerLiter));
    if (company?.priceDieselPerLiter !== undefined) setPriceDieselPerLiter(company.priceDieselPerLiter == null ? "" : String(company.priceDieselPerLiter));
    if (company?.priceHybridPerLiter !== undefined) setPriceHybridPerLiter(company.priceHybridPerLiter == null ? "" : String(company.priceHybridPerLiter));
    if (company?.priceElectricityPerKwh !== undefined) setPriceElectricityPerKwh(company.priceElectricityPerKwh == null ? "" : String(company.priceElectricityPerKwh));
  }, [company?.defaultKmUsage, company?.averageFuelPricePerLiter, company?.defaultConsumptionL100km, company?.priceBenzinePerLiter, company?.priceDieselPerLiter, company?.priceHybridPerLiter, company?.priceElectricityPerKwh]);

  async function handleAddCar(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const consumptionVal = addCarConsumption.trim() === "" ? null : parseFloat(String(addCarConsumption).replace(",", "."));
      const consumption = consumptionVal != null && !Number.isNaN(consumptionVal) && consumptionVal >= 0 && consumptionVal <= 30 ? consumptionVal : null;
      const consumptionKwhVal = addCarConsumptionKwh.trim() === "" ? null : parseFloat(String(addCarConsumptionKwh).replace(",", "."));
      const consumptionKwh = consumptionKwhVal != null && !Number.isNaN(consumptionKwhVal) && consumptionKwhVal >= 0 ? consumptionKwhVal : null;
      const batteryLevelVal = addCarBatteryLevel.trim() === "" ? null : parseInt(addCarBatteryLevel, 10);
      const batteryLevel = batteryLevelVal != null && !Number.isNaN(batteryLevelVal) ? Math.min(100, Math.max(0, batteryLevelVal)) : null;
      const batteryCapVal = addCarBatteryCapacityKwh.trim() === "" ? null : parseFloat(String(addCarBatteryCapacityKwh).replace(",", "."));
      const batteryCapacityKwh = batteryCapVal != null && !Number.isNaN(batteryCapVal) && batteryCapVal >= 0 ? batteryCapVal : null;
      const lastServiceVal = addCarLastServiceMileage.trim() === "" ? null : parseInt(addCarLastServiceMileage, 10);
      const lastServiceMileage = lastServiceVal != null && !Number.isNaN(lastServiceVal) && lastServiceVal >= 0 ? lastServiceVal : null;
      const ymTrim = addCarLastServiceMonth.trim();
      if (ymTrim && !LAST_SERVICE_YM.test(ymTrim)) {
        setError("Last service month must be a valid month (year–month).");
        setSubmitting(false);
        return;
      }
      const lastServiceYearMonth = ymTrim && LAST_SERVICE_YM.test(ymTrim) ? ymTrim : undefined;
      await apiAddCar({
        brand: addCarBrand.trim(),
        registrationNumber: addCarReg.trim().toUpperCase(),
        km: Number(addCarKm) || 0,
        status: addCarStatus,
        fuelType: addCarFuelType,
        averageConsumptionL100km: consumption,
        averageConsumptionKwh100km: (addCarFuelType === "Electric" || addCarFuelType === "Hybrid") ? consumptionKwh : undefined,
        batteryLevel: (addCarFuelType === "Electric" || addCarFuelType === "Hybrid") ? batteryLevel : undefined,
        batteryCapacityKwh: (addCarFuelType === "Electric" || addCarFuelType === "Hybrid") ? batteryCapacityKwh : undefined,
        lastServiceMileage: lastServiceMileage ?? undefined,
        lastServiceYearMonth,
      });
      setAddCarBrand("");
      setAddCarReg("");
      setAddCarKm(0);
      setAddCarStatus("AVAILABLE");
      setAddCarFuelType("Benzine");
      setAddCarConsumption("");
      setAddCarConsumptionKwh("");
      setAddCarBatteryLevel("");
      setAddCarBatteryCapacityKwh("");
      setAddCarLastServiceMileage("");
      setAddCarLastServiceMonth("");
      setShowAddCar(false);
      load();
    } catch (err) {
      setError(err.message || "Failed to add car");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCarStatusChange(carId, newStatus) {
    try {
      await apiUpdateCar(carId, { status: newStatus });
      load();
    } catch (err) {
      setError(err.message || "Failed to update");
    }
  }

  async function handleDeleteCar(carId) {
    if (!confirm("Delete this car?")) return;
    try {
      await apiDeleteCar(carId);
      load();
    } catch (err) {
      setError(err.message || "Failed to delete");
    }
  }

  async function handleInviteUser(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiInviteUser(inviteEmail.trim(), inviteName.trim() || undefined, inviteRole);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("USER");
      setShowAddUser(false);
      load();
    } catch (err) {
      setError(err.message || "Failed to invite");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiCreateUser(inviteEmail.trim(), inviteName.trim() || inviteEmail.trim(), addUserPassword.trim() || undefined, inviteRole);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("USER");
      setAddUserPassword("");
      setShowAddUser(false);
      load();
    } catch (err) {
      setError(err.message || "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRoleChange(memberUserId, newRole) {
    try {
      await apiUpdateUserRole(memberUserId, newRole);
      load();
    } catch (err) {
      setError(err.message || "Failed to update role");
    }
  }

  async function handleRemoveUser(memberUserId) {
    if (!confirm("Remove this user from the company?")) return;
    try {
      await apiRemoveUser(memberUserId);
      load();
    } catch (err) {
      setError(err.message || "Failed to remove");
    }
  }

  const adminNavGroups = useMemo(
    () => [
      {
        label: t("nav.sections.overview"),
        items: [
          { id: "company", label: t("nav.items.company"), icon: <Building2 className={ICON.s} aria-hidden /> },
          { id: "statistics", label: t("nav.items.statistics"), icon: <BarChart2 className={ICON.s} aria-hidden /> },
        ],
      },
      {
        label: t("nav.sections.fleet"),
        items: [
          { id: "cars", label: t("nav.items.manageCars"), icon: <Car className={ICON.s} aria-hidden /> },
          { id: "fleetCalendar", label: t("nav.items.fleetCalendar"), icon: <CalendarDays className={ICON.s} aria-hidden /> },
          { id: "maintenance", label: t("nav.items.maintenance"), icon: <Wrench className={ICON.s} aria-hidden /> },
          { id: "history", label: t("nav.items.history"), icon: <History className={ICON.s} aria-hidden /> },
          { id: "verifyCode", label: t("nav.items.verifyCode"), icon: <KeyRound className={ICON.s} aria-hidden /> },
        ],
      },
      {
        label: t("nav.sections.admin"),
        items: [
          { id: "users", label: t("nav.items.manageUsers"), icon: <Users className={ICON.s} aria-hidden /> },
          { id: "invites", label: t("nav.items.invites"), icon: <Mail className={ICON.s} aria-hidden /> },
          { id: "aiVerification", label: t("nav.items.aiVerification"), icon: <FileScan className={ICON.s} aria-hidden /> },
          { id: "auditLogs", label: t("nav.items.auditLogs"), icon: <ShieldCheck className={ICON.s} aria-hidden /> },
        ],
      },
    ],
    [t]
  );

  const metaKey = ADMIN_PAGE_META_KEYS[section];
  const pageMeta =
    metaKey != null
      ? { title: t(`pageMeta.${metaKey}.title`), sub: t(`pageMeta.${metaKey}.sub`) }
      : { title: t("nav.sections.admin"), sub: "" };
  const pageSub =
    section === "cars" && dataSourceConfig?.cars != null
      ? `${pageMeta.sub} — ${getProviderLabelWithTable(dataSourceConfig.cars, dataSourceConfig.carsTable)}`
      : pageMeta.sub;

  return (
    <div className="flex h-full w-full min-h-0" style={{ background: "var(--main-bg)" }}>
      <Sidebar user={user} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} viewAs={viewAs} setViewAs={setViewAs}>
        {adminNavGroups.map((group, gi) => (
          <NavSection key={gi}>
            <NavLabel>{group.label}</NavLabel>
            {group.items.map((s) => (
              <NavItem
                key={s.id}
                active={section === s.id}
                onClick={() => {
                  setSection(s.id);
                  setMobileOpen(false);
                }}
                icon={s.icon}
                label={s.label}
              />
            ))}
          </NavSection>
        ))}
      </Sidebar>
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        <header className="fleet-topbar w-full min-w-0 shrink-0 z-10 flex flex-wrap items-center justify-between gap-3 py-3.5 px-4 sm:px-6 md:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 rounded-lg bg-slate-100 text-slate-700 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-slate-200 transition-colors border border-slate-200/80"
              aria-label={t("common.openMenu")}
            >
              ☰
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-medium text-slate-900 truncate">{pageMeta.title}</h1>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{pageSub}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <LanguageCurrencySwitcher variant="light" />
            {company?.joinCode && (
              <span className="join-badge-pill font-medium hidden sm:inline">
                {t("nav.joinCode")} <span className="font-mono">{company.joinCode}</span>
              </span>
            )}
            {section === "cars" && !dataSourceNotConfigured.cars && (
              <button
                type="button"
                onClick={() => setShowAddCar((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-white px-3.5 py-2 rounded-md shadow-sm transition-colors bg-[var(--primary)] hover:bg-[var(--primary-hover)]"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                {showAddCar ? t("common.hideForm") : t("common.addCar")}
              </button>
            )}
            {(section === "users" || section === "invites") && !dataSourceNotConfigured.users && (
              <button
                type="button"
                onClick={() => setShowAddUser((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-white px-3.5 py-2 rounded-md shadow-sm transition-colors bg-[var(--primary)] hover:bg-[var(--primary-hover)]"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                {showAddUser ? t("common.close") : section === "invites" ? t("common.inviteUser") : t("common.addUser")}
              </button>
            )}
          </div>
        </header>
        <main className="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-5 sm:p-6 md:px-8 md:pb-8 md:pt-6">
        {company?.joinCode && (
          <p className="mb-4 text-xs text-slate-500 sm:hidden">
            Join code: <code className="font-mono text-slate-800 font-semibold">{company.joinCode}</code>
          </p>
        )}
        {error && (
          <div className="mb-6 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100">{error}</div>
        )}

        {section === "company" && (
          <section className="w-full min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Company</h2>
              {company?.joinCode && (
                <div className="shrink-0 bg-[#1E293B] text-white rounded-xl px-4 py-3 border border-slate-600/50 shadow-sm">
                  <p className="text-xs font-medium text-slate-300 uppercase tracking-wide">Join code</p>
                  <p className="text-xl font-bold font-mono text-white mt-0.5">{company.joinCode}</p>
                  <p className="text-xs text-slate-400 mt-1">Share so others can join</p>
                </div>
              )}
            </div>
            <div className="w-full bg-white rounded-[12px] shadow-[0_1px_3px_0_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06)] p-4 sm:p-6 border border-slate-100/80">
              <form onSubmit={saveCompanySettings} className="space-y-6 max-w-2xl">
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">Default km per reservation</label>
                  <p className="text-xs text-slate-500 mb-2">Allowed km per reservation. Users must give a reason if they exceed this.</p>
                  <div className="flex flex-wrap gap-2 items-center">
                    <input
                      type="number"
                      min={1}
                      max={99999}
                      value={defaultKmUsage}
                      onChange={(e) => setDefaultKmUsage(e.target.value)}
                      className="w-24 px-3 py-2 border border-slate-200 rounded-xl text-slate-800 bg-white focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none transition-shadow"
                    />
                    <span className="text-slate-500">km</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">Default consumption (L/100km)</label>
                  <p className="text-xs text-slate-500 mb-2">Used when a car has no consumption set (e.g. 7.5).</p>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.1}
                    value={defaultConsumptionL100km}
                    onChange={(e) => setDefaultConsumptionL100km(e.target.value)}
                    placeholder="7.5"
                    className="w-24 px-3 py-2 border border-slate-200 rounded-xl text-slate-800 bg-white focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                  />
                </div>
                <div className="border-t border-slate-200 pt-4">
                  <p className="text-sm font-semibold text-slate-700 mb-2">Global fuel & electricity pricing (for Statistics)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Benzine (currency/L)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={priceBenzinePerLiter}
                        onChange={(e) => setPriceBenzinePerLiter(e.target.value)}
                        placeholder="e.g. 1.50"
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 bg-white focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Diesel (currency/L)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={priceDieselPerLiter}
                        onChange={(e) => setPriceDieselPerLiter(e.target.value)}
                        placeholder="e.g. 1.45"
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 bg-white focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Hybrid — ICE (currency/L)</label>
                      <p className="text-[11px] text-slate-400 mb-1">Liquid fuel part; falls back to Benzine/Diesel if empty.</p>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={priceHybridPerLiter}
                        onChange={(e) => setPriceHybridPerLiter(e.target.value)}
                        placeholder="e.g. 1.50"
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 bg-white focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Electricity (currency/kWh)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={priceElectricityPerKwh}
                        onChange={(e) => setPriceElectricityPerKwh(e.target.value)}
                        placeholder="e.g. 0.25"
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 bg-white focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Legacy: single &quot;Price per Liter&quot; below (used if per-type prices not set).</p>
                  <div className="flex flex-wrap gap-2 items-center mt-2">
                    <input
                      type="number"
                      min={0}
                      max={999}
                      step={0.01}
                      value={averageFuelPricePerLiter}
                      onChange={(e) => setAverageFuelPricePerLiter(e.target.value)}
                      placeholder="e.g. 1.50"
                      className="w-28 px-3 py-2 border border-slate-200 rounded-xl text-slate-800 bg-white focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                    />
                    <span className="text-slate-500">currency/L (fallback)</span>
                  </div>
                </div>
                <button type="submit" disabled={defaultKmSaving} className="px-4 py-2 bg-[var(--primary)] text-white font-semibold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 min-h-[44px] shadow-sm transition-colors">
                  {defaultKmSaving ? "Saving…" : "Save settings"}
                </button>
              </form>
            </div>
            {pendingApprovals.length > 0 && (
              <div className="mt-6 w-full">
                <h3 className="text-lg font-semibold text-slate-800 mb-3">Pending km-exceeded approvals</h3>
                <p className="text-sm text-slate-500 mb-4">Users exceeded the allowed km and gave a reason. Approve or reject.</p>
                <div className="space-y-4">
                  {pendingApprovals.map((r) => (
                    <div key={r.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 shadow-sm">
                      <div className="flex flex-wrap gap-2 items-center justify-between mb-2">
                        <span className="font-medium text-slate-800">{r.user?.name} – {r.car?.brand} {r.car?.registrationNumber}</span>
                        <span className="text-sm text-slate-500">{r.releasedKmUsed} km used</span>
                      </div>
                      <p className="text-sm text-slate-700 mb-3">{r.releasedExceededReason}</p>
                      <div className="mb-3">
                        <label className="block text-sm font-semibold text-slate-600 mb-1">Observations (visible to user)</label>
                        <textarea
                          value={pendingApprovalObservations[r.id] ?? ""}
                          onChange={(e) => setPendingApprovalObservations((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder="Optional comment for the user…"
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 bg-white text-sm focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                          rows={2}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleExceededApproval(r.id, "approveExceeded")}
                          className="px-3 py-2 min-h-[44px] bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 shadow-sm transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExceededApproval(r.id, "rejectExceeded")}
                          className="px-3 py-2 min-h-[44px] bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 shadow-sm transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {section === "statistics" && (
          <StatisticsDashboard
            reservations={reservations}
            company={company}
            users={users}
            cars={cars}
          />
        )}

        {section === "cars" && (
          <section className="w-full min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <h2 className="text-2xl font-bold text-slate-800">Manage Cars</h2>
              {dataSourceConfig?.cars != null && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  Source: {getProviderLabelWithTable(dataSourceConfig.cars, dataSourceConfig.carsTable)}
                </span>
              )}
            </div>
            {dataSourceNotConfigured.cars ? (
              <DataSourceNotConfiguredEmptyState layerLabel="Cars" className="min-h-[200px]" />
            ) : (
            <>
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white border border-[var(--border-tertiary)] rounded-xl px-4 py-3">
                <div className="text-[11px] text-slate-500 mb-1">Total fleet</div>
                <div className="text-2xl font-semibold text-slate-900">
                  {totalCars}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {company?.name || "All registered"}
                </div>
              </div>
              <div className="bg-white border border-[var(--border-tertiary)] rounded-xl px-4 py-3">
                <div className="text-[11px] text-slate-500 mb-1">Available</div>
                <div className="text-2xl font-semibold text-slate-900">
                  {availableCars.length}
                </div>
                <div className="text-[11px] text-emerald-700 mt-1">
                  {totalCars > 0 ? `${Math.round((availableCars.length / totalCars) * 100)}% of fleet` : "—"}
                </div>
              </div>
              <div className="bg-white border border-[var(--border-tertiary)] rounded-xl px-4 py-3">
                <div className="text-[11px] text-slate-500 mb-1">Service due</div>
                <div className="text-2xl font-semibold text-slate-900">
                  {serviceDueCount}
                </div>
                <div className="text-[11px] text-amber-700 mt-1">
                  {serviceDueCount > 0 ? "Oil change needed" : "All good"}
                </div>
              </div>
              <div className="bg-white border border-[var(--border-tertiary)] rounded-xl px-4 py-3">
                <div className="text-[11px] text-slate-500 mb-1">Avg mileage</div>
                <div className="text-2xl font-semibold text-slate-900">
                  {averageMileage > 0 ? formatNumber(averageMileage, { maximumFractionDigits: 0 }) : "—"}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">km across fleet</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 p-4 mb-4 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-sm font-semibold text-slate-600 self-center">Filters:</span>
              <input
                type="text"
                placeholder="Brand"
                value={carsFilterBrand}
                onChange={(e) => setCarsFilterBrand(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-[100px] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary-ring)] outline-none"
              />
              <input
                type="text"
                placeholder="Registration"
                value={carsFilterReg}
                onChange={(e) => setCarsFilterReg(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-[120px] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary-ring)] outline-none"
              />
              <select
                value={carsFilterFuel}
                onChange={(e) => setCarsFilterFuel(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary-ring)] outline-none"
              >
                <option value="">All fuel types</option>
                <option value="Benzine">Benzine</option>
                <option value="Diesel">Diesel</option>
                <option value="Electric">Electric</option>
                <option value="Hybrid">Hybrid</option>
              </select>
              <select
                value={carsFilterStatus}
                onChange={(e) => setCarsFilterStatus(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary-ring)] outline-none"
              >
                <option value="">All statuses</option>
                <option value="AVAILABLE">Available</option>
                <option value="RESERVED">Reserved</option>
                <option value="IN_MAINTENANCE">In maintenance</option>
              </select>
              <button
                type="button"
                onClick={() => { setCarsFilterBrand(""); setCarsFilterReg(""); setCarsFilterFuel(""); setCarsFilterStatus(""); }}
                className="px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
              >
                Clear filters
              </button>
            </div>
            {showAddCar && (
              <form onSubmit={handleAddCar} className="mb-6 p-4 sm:p-5 bg-slate-50 rounded-xl border border-slate-100 shadow-sm space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Vehicle</p>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex flex-col gap-1 min-w-[120px]">
                      <label htmlFor="add-car-brand" className="text-xs font-medium text-slate-600">Brand</label>
                      <input
                        id="add-car-brand"
                        type="text"
                        value={addCarBrand}
                        onChange={(e) => setAddCarBrand(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-xl focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1 min-w-[140px]">
                      <label htmlFor="add-car-reg" className="text-xs font-medium text-slate-600">Registration</label>
                      <input
                        id="add-car-reg"
                        type="text"
                        value={addCarReg}
                        onChange={(e) => setAddCarReg(e.target.value.toUpperCase())}
                        className="px-3 py-2 border border-slate-200 rounded-xl focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1 w-28">
                      <label htmlFor="add-car-km" className="text-xs font-medium text-slate-600">Current odometer (km)</label>
                      <input
                        id="add-car-km"
                        type="number"
                        value={addCarKm}
                        onChange={(e) => setAddCarKm(e.target.value)}
                        min={0}
                        className="px-3 py-2 border border-slate-200 rounded-xl focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1 min-w-[130px]">
                      <label htmlFor="add-car-status" className="text-xs font-medium text-slate-600">Status</label>
                      <select
                        id="add-car-status"
                        value={addCarStatus}
                        onChange={(e) => setAddCarStatus(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-xl focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                      >
                        <option value="AVAILABLE">Available</option>
                        <option value="RESERVED">Reserved</option>
                        <option value="IN_MAINTENANCE">In maintenance</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 min-w-[120px]">
                      <label htmlFor="add-car-fuel" className="text-xs font-medium text-slate-600">Fuel type</label>
                      <select
                        id="add-car-fuel"
                        value={addCarFuelType}
                        onChange={(e) => setAddCarFuelType(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-xl focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                      >
                        <option value="Benzine">Benzine</option>
                        <option value="Diesel">Diesel</option>
                        <option value="Electric">Electric</option>
                        <option value="Hybrid">Hybrid</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Fuel &amp; efficiency</p>
                  <div className="flex flex-wrap gap-3 items-end">
                    {(addCarFuelType === "Benzine" || addCarFuelType === "Diesel") && (
                      <div className="flex flex-col gap-1 w-28">
                        <label htmlFor="add-car-l100" className="text-xs font-medium text-slate-600">Consumption (L/100km)</label>
                        <input
                          id="add-car-l100"
                          type="number"
                          min={0}
                          max={30}
                          step={0.1}
                          value={addCarConsumption}
                          onChange={(e) => setAddCarConsumption(e.target.value)}
                          placeholder="e.g. 7.5"
                          className="px-3 py-2 border border-slate-200 rounded-xl focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                        />
                      </div>
                    )}
                    {(addCarFuelType === "Electric" || addCarFuelType === "Hybrid") && (
                      <>
                        <div className="flex flex-col gap-1 w-24">
                          <label htmlFor="add-car-batt-pct" className="text-xs font-medium text-slate-600">Battery %</label>
                          <input
                            id="add-car-batt-pct"
                            type="number"
                            min={0}
                            max={100}
                            value={addCarBatteryLevel}
                            onChange={(e) => setAddCarBatteryLevel(e.target.value)}
                            className="px-3 py-2 border border-slate-200 rounded-xl focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1 min-w-[9rem]">
                          <label htmlFor="add-car-batt-kwh" className="text-xs font-medium text-slate-600">Battery capacity (kWh)</label>
                          <input
                            id="add-car-batt-kwh"
                            type="number"
                            min={0}
                            step={0.1}
                            value={addCarBatteryCapacityKwh}
                            onChange={(e) => setAddCarBatteryCapacityKwh(e.target.value)}
                            className="px-3 py-2 border border-slate-200 rounded-xl focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1 w-32">
                          <label htmlFor="add-car-kwh100" className="text-xs font-medium text-slate-600">Use (kWh/100km)</label>
                          <input
                            id="add-car-kwh100"
                            type="number"
                            min={0}
                            step={0.1}
                            value={addCarConsumptionKwh}
                            onChange={(e) => setAddCarConsumptionKwh(e.target.value)}
                            className="px-3 py-2 border border-slate-200 rounded-xl focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Service &amp; maintenance</p>
                  <p className="text-xs text-slate-500 mb-3 max-w-2xl">
                    For <strong className="text-slate-700">Benzine / Diesel / Hybrid</strong>, we flag an <strong className="text-slate-700">oil change</strong> when the odometer has moved more than <strong className="text-slate-700">10,000 km</strong> since the last service reading.
                    For <strong className="text-slate-700">Electric</strong>, we suggest a <strong className="text-slate-700">battery check</strong> when the car has mileage recorded. Use the month of the last workshop visit and the odometer reading from that visit if you have them.
                  </p>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex flex-col gap-1 min-w-[11rem]">
                      <label htmlFor="add-car-svc-month" className="text-xs font-medium text-slate-600">Last service (month &amp; year)</label>
                      <input
                        id="add-car-svc-month"
                        type="month"
                        value={addCarLastServiceMonth}
                        onChange={(e) => setAddCarLastServiceMonth(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1 w-36">
                      <label htmlFor="add-car-svc-km" className="text-xs font-medium text-slate-600">Odometer at last service (km)</label>
                      <input
                        id="add-car-svc-km"
                        type="number"
                        min={0}
                        value={addCarLastServiceMileage}
                        onChange={(e) => setAddCarLastServiceMileage(e.target.value)}
                        placeholder="Optional"
                        className="px-3 py-2 border border-slate-200 rounded-xl focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                  <button type="submit" disabled={submitting} className="px-4 py-2.5 bg-[var(--primary)] text-white font-semibold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-sm transition-colors">
                    Save car
                  </button>
                </div>
              </form>
            )}
            <div className="w-full overflow-x-auto rounded-xl border border-slate-200/80 shadow-sm">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="py-4 px-4 font-semibold text-slate-700">Brand</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Registration</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Fuel</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Km</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Consumption</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Service</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Status</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Access codes</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {filteredCars.map((c) => {
                    const service = needsService(c);
                    const activeRes = reservations.find((r) => r.carId === c.id && (r.status || "").toLowerCase() === "active");
                    return (
                      <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/80 transition-colors">
                        <td className="py-4 px-4">{c.brand}</td>
                        <td className="py-4 px-4">{c.registrationNumber}</td>
                        <td className="py-4 px-4"><FuelTypeBadge fuelType={c.fuelType} /></td>
                        <td className="py-4 px-4">{formatNumber(c.km ?? 0, { maximumFractionDigits: 0 })}</td>
                        <td className="py-4 px-4">
                          {(c.fuelType === "Electric" || c.fuelType === "Hybrid")
                            ? (c.averageConsumptionKwh100km != null
                              ? `${formatNumber(c.averageConsumptionKwh100km, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kWh/100km`
                              : "—")
                            : <CarConsumptionCell car={c} onUpdated={load} />}
                        </td>
                        <td className="py-4 px-4">
                          {service.need ? (
                            <span
                              className="inline-flex flex-col gap-0.5 items-start"
                              title={[
                                service.since != null ? `${formatNumber(service.since, { maximumFractionDigits: 0 })} km since last recorded service` : null,
                                formatLastServiceYearMonth(c.lastServiceYearMonth),
                                c.lastServiceMileage != null ? `Last service odometer: ${formatNumber(c.lastServiceMileage, { maximumFractionDigits: 0 })} km` : null,
                              ].filter(Boolean).join(" · ")}
                            >
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                {service.type} due
                              </span>
                              {(formatLastServiceYearMonth(c.lastServiceYearMonth) || c.lastServiceMileage != null) && (
                                <span className="text-[11px] text-slate-500 max-w-[14rem] leading-snug">
                                  {[
                                    formatLastServiceYearMonth(c.lastServiceYearMonth),
                                    c.lastServiceMileage != null ? `@ ${formatNumber(c.lastServiceMileage, { maximumFractionDigits: 0 })} km` : null,
                                  ].filter(Boolean).join(" ")}
                                </span>
                              )}
                            </span>
                          ) : (
                            (() => {
                              const parts = [
                                formatLastServiceYearMonth(c.lastServiceYearMonth),
                                c.lastServiceMileage != null ? `${formatNumber(c.lastServiceMileage, { maximumFractionDigits: 0 })} km at last service` : null,
                              ].filter(Boolean);
                              return parts.length > 0 ? (
                                <span className="text-slate-600 text-sm leading-snug">{parts.join(" · ")}</span>
                              ) : (
                                <span className="text-slate-400 text-sm">—</span>
                              );
                            })()
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <select
                            value={c.status}
                            onChange={(e) => handleCarStatusChange(c.id, e.target.value)}
                            className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary-ring)] outline-none"
                          >
                            <option value="AVAILABLE">Available</option>
                            <option value="RESERVED">Reserved</option>
                            <option value="IN_MAINTENANCE">In maintenance</option>
                          </select>
                        </td>
                        <td className="py-4 px-4">
                          {activeRes ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={ACCESS_CODE_SLOT_CLASS} title="Start rental">
                                {activeRes.pickup_code != null ? activeRes.pickup_code : <span className="text-slate-400">—</span>}
                              </span>
                              {activeRes.pickup_code != null && (
                                <AccessCodeQRButton code={activeRes.pickup_code} label="QR start" />
                              )}
                              <span className={ACCESS_CODE_SLOT_CLASS} title="End rental">
                                {activeRes.release_code != null ? activeRes.release_code : <span className="text-slate-400">—</span>}
                              </span>
                              {activeRes.release_code != null && (
                                <AccessCodeQRButton code={activeRes.release_code} label="QR end" />
                              )}
                              <button
                                type="button"
                                onClick={() => handleRefreshCodes(activeRes.id)}
                                disabled={refreshingCodeId === activeRes.id}
                                className="px-2 py-1 text-xs font-semibold text-[#1E293B] border border-[#1E293B]/30 rounded-lg hover:bg-[#1E293B]/10 disabled:opacity-50"
                              >
                                {refreshingCodeId === activeRes.id ? "…" : "Generate New Code"}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-sm">—</span>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <button
                            type="button"
                            onClick={() => handleDeleteCar(c.id)}
                            className="px-3 py-1.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 shadow-sm transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredCars.length === 0 && !loading && (
                    <tr><td colSpan={9} className="py-10 px-4 text-center text-slate-500">{cars.length === 0 ? "No cars yet" : "No cars match the filters"}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            </>
            )}
          </section>
        )}

        {section === "fleetCalendar" && (
          <section className="w-full min-w-0 flex flex-col flex-1 min-h-0">
            <div className="shrink-0">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-2">Fleet calendar</h2>
              <p className="text-sm text-slate-600 mb-4 max-w-3xl">
                Week or day view lists each vehicle; blocks show who booked the car. Empty space means the car has no reservation in that period (subject to company rules).
              </p>
            </div>
            {dataSourceNotConfigured.reservations ? (
              <DataSourceNotConfiguredEmptyState layerLabel="Reservations" className="min-h-[200px] shrink-0" />
            ) : loading ? (
              <p className="text-slate-500 shrink-0">Loading…</p>
            ) : (
              <FleetBookingCalendar
                reservations={reservations}
                cars={cars}
                variant="fleet"
                className="flex-1 min-h-0"
              />
            )}
          </section>
        )}

        {section === "verifyCode" && (
          <section className="w-full min-w-0">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Verify Pickup Code</h2>
            <p className="text-sm text-slate-500 mb-4">Enter the 6-digit pickup code to validate. Use &quot;Bypass time window&quot; to accept codes outside the 30-minute window (e.g. user is late).</p>
            <form onSubmit={handleVerifyCode} className="max-w-md space-y-4 p-4 bg-white rounded-xl border border-slate-200/80 shadow-sm">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Pickup code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={verifyCodeInput}
                  onChange={(e) => setVerifyCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="e.g. 123456"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 font-mono text-lg tracking-widest focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={verifyBypass}
                  onChange={(e) => setVerifyBypass(e.target.checked)}
                  className="rounded border-slate-300 text-[#1E293B] focus:ring-[#1E293B]"
                />
                <span className="text-sm font-medium text-slate-700">Bypass time window</span>
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={verifySubmitting || !verifyCodeInput.trim()}
                  className="px-4 py-2.5 bg-[#1E293B] text-white font-semibold rounded-xl hover:bg-[#334155] disabled:opacity-50 shadow-sm transition-colors"
                >
                  {verifySubmitting ? "Verifying…" : "Verify"}
                </button>
                <button
                  type="button"
                  onClick={() => { setVerifyCodeInput(""); setVerifyResult(null); setVerifyBypass(false); }}
                  className="px-4 py-2.5 bg-slate-100 text-slate-800 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Clear
                </button>
              </div>
            </form>
            {verifyResult && (
              <div className={`mt-4 p-4 rounded-xl border ${verifyResult.valid ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                {verifyResult.valid ? (
                  <>
                    <p className="font-semibold text-emerald-800 mb-2">✓ Code valid</p>
                    <p className="text-sm text-emerald-700">
                      {verifyResult.reservation?.car?.brand} {verifyResult.reservation?.car?.registrationNumber} — {verifyResult.reservation?.user?.name || verifyResult.reservation?.user?.email}
                    </p>
                  </>
                ) : (
                  <p className="font-semibold text-red-800">{verifyResult.error}</p>
                )}
              </div>
            )}
          </section>
        )}

        {section === "users" && (
          <section>
            <div className="flex flex-wrap items-center gap-3 mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Manage Users</h2>
              {dataSourceConfig?.users != null && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  Source: {getProviderLabelWithTable(dataSourceConfig.users, dataSourceConfig.usersTable)}
                </span>
              )}
            </div>
            {dataSourceNotConfigured.users ? (
              <DataSourceNotConfiguredEmptyState layerLabel="Users" className="min-h-[200px]" />
            ) : (
            <>
            <div className="flex flex-wrap gap-3 p-4 mb-4 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-sm font-semibold text-slate-600 self-center">Filters:</span>
              <input
                type="text"
                placeholder="Email"
                value={usersFilterEmail}
                onChange={(e) => setUsersFilterEmail(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-[140px] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary-ring)] outline-none"
              />
              <input
                type="text"
                placeholder="Name"
                value={usersFilterName}
                onChange={(e) => setUsersFilterName(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-[120px] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary-ring)] outline-none"
              />
              <select
                value={usersFilterRole}
                onChange={(e) => setUsersFilterRole(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary-ring)] outline-none"
              >
                <option value="">All roles</option>
                <option value="ADMIN">Admin</option>
                <option value="USER">User</option>
              </select>
              <select
                value={usersFilterStatus}
                onChange={(e) => setUsersFilterStatus(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary-ring)] outline-none"
              >
                <option value="">All statuses</option>
                <option value="enrolled">Enrolled</option>
                <option value="pending">Pending</option>
              </select>
              <select
                value={usersFilterDl}
                onChange={(e) => setUsersFilterDl(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary-ring)] outline-none"
              >
                <option value="">All driving licence</option>
                <option value="APPROVED">Approved</option>
                <option value="PENDING">Pending</option>
                <option value="REJECTED">Rejected</option>
                <option value="NONE">None</option>
              </select>
              <button
                type="button"
                onClick={() => { setUsersFilterEmail(""); setUsersFilterName(""); setUsersFilterRole(""); setUsersFilterStatus(""); setUsersFilterDl(""); }}
                className="px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
              >
                Clear filters
              </button>
            </div>
            <div className="w-full overflow-x-auto rounded-xl border border-slate-200/80 shadow-sm">
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="py-4 px-4 font-semibold text-slate-700">Email</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Name</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Role</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Status</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Driving licence</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Identity</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {filteredUsers.map((m) => (
                    <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-4">{m.email}</td>
                      <td className="py-4 px-4">{m.name}</td>
                      <td className="py-4 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                            m.role === "ADMIN" ? "bg-blue-900 text-white" : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {m.role}
                        </span>
                      </td>
                      <td className="py-4 px-4">{m.status}</td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                          m.drivingLicenceStatus === "APPROVED" ? "bg-emerald-100 text-emerald-800" :
                          m.drivingLicenceStatus === "PENDING" ? "bg-amber-100 text-amber-800" :
                          m.drivingLicenceStatus === "REJECTED" ? "bg-red-100 text-red-800" :
                          "bg-slate-100 text-slate-600"
                        }`}>
                          {m.drivingLicenceStatus === "APPROVED" ? "Approved" : m.drivingLicenceStatus === "PENDING" ? "Pending" : m.drivingLicenceStatus === "REJECTED" ? "Rejected" : "—"}
                        </span>
                        <span className="ml-2 text-[11px] text-slate-500">
                          {m.drivingLicenceVerifiedBy === "AI" ? "AI" : m.drivingLicenceVerifiedBy === "ADMIN" ? "Admin" : ""}
                        </span>
                        {m.drivingLicenceUrl && (
                          <>
                            <button type="button" onClick={() => setDlImageModal(m.drivingLicenceUrl)} className="ml-2 px-2 py-1 text-xs font-semibold text-[var(--primary)] hover:underline">View</button>
                            {m.drivingLicenceStatus === "PENDING" && (
                              <span className="inline-flex gap-1 ml-1">
                                <button type="button" onClick={() => handleDlStatus(m.userId, "APPROVED")} className="px-2 py-1 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Approve</button>
                                <button type="button" onClick={() => handleDlStatus(m.userId, "REJECTED")} className="px-2 py-1 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700">Reject</button>
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                          m.identityStatus === "VERIFIED" ? "bg-emerald-100 text-emerald-800" :
                          m.identityStatus === "PENDING" || m.identityStatus === "PENDING_REVIEW" ? "bg-amber-100 text-amber-800" :
                          m.identityStatus === "REJECTED" ? "bg-red-100 text-red-800" :
                          "bg-slate-100 text-slate-600"
                        }`}>
                          {m.identityStatus || "—"}
                        </span>
                        <span className="ml-2 text-[11px] text-slate-500">
                          {m.identityVerifiedBy === "AI" ? "AI" : m.identityVerifiedBy === "ADMIN" ? "Admin" : ""}
                        </span>
                        {m.selfieUrl && (
                          <button type="button" onClick={() => setDlImageModal(m.selfieUrl)} className="ml-2 px-2 py-1 text-xs font-semibold text-[var(--primary)] hover:underline">View</button>
                        )}
                        {(m.identityStatus === "PENDING_REVIEW" || m.identityStatus === "REJECTED" || m.identityStatus === "PENDING") && (
                          <span className="inline-flex gap-1 ml-1">
                            <button type="button" onClick={() => handleIdentityStatus(m.userId, "VERIFIED")} className="px-2 py-1 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Approve</button>
                            <button type="button" onClick={() => handleIdentityStatus(m.userId, "REJECTED")} className="px-2 py-1 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700">Reject</button>
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 flex flex-wrap gap-2">
                        {m.userId !== user?.id ? (
                          <button
                            type="button"
                            onClick={() => handleRoleChange(m.userId, m.role === "ADMIN" ? "USER" : "ADMIN")}
                            className={`px-3 py-2 min-h-[44px] sm:min-h-0 text-sm font-semibold rounded-xl shadow-sm transition-colors ${
                              m.role === "ADMIN"
                                ? "bg-blue-100 text-blue-900 hover:bg-blue-200"
                                : "bg-blue-900 text-white hover:bg-blue-950"
                            }`}
                          >
                            {m.role === "ADMIN" ? "Set User" : "Set Admin"}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">(you)</span>
                        )}
                        {m.userId !== user?.id && (
                          <button
                            type="button"
                            onClick={() => handleRemoveUser(m.userId)}
                            className="px-3 py-2 min-h-[44px] sm:min-h-0 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 shadow-sm transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && !loading && (
                    <tr><td colSpan={7} className="py-10 px-4 text-center text-slate-500">{users.length === 0 ? "No users yet" : "No users match the filters"}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            </>
            )}
          </section>
        )}

        {section === "invites" && (
          <section className="w-full min-w-0">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Invites</h2>
            <p className="text-sm text-slate-500 mb-4">See who was invited and whether they joined the platform.</p>
            <div className="w-full overflow-hidden rounded-xl border border-slate-200/80 shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="py-4 px-4 font-semibold text-slate-700">Email</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Invited at</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Status</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Expires</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {invites.map((inv) => (
                    <tr key={inv.id} className="border-t border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-4">{inv.email}</td>
                      <td className="py-4 px-4">{formatDate(inv.createdAt)}</td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                          inv.status === "joined" ? "bg-emerald-100 text-emerald-800" :
                          inv.status === "expired" ? "bg-slate-200 text-slate-700" :
                          "bg-amber-100 text-amber-800"
                        }`}>
                          {inv.status === "joined" ? "Joined" : inv.status === "expired" ? "Expired" : "Pending"}
                        </span>
                      </td>
                      <td className="py-4 px-4">{formatDate(inv.expiresAt)}</td>
                    </tr>
                  ))}
                  {invites.length === 0 && !loading && (
                    <tr><td colSpan={4} className="py-10 px-4 text-center text-slate-500">No invites yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {section === "history" && (
          <section className="w-full min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <h2 className="text-2xl font-bold text-slate-800">Car Sharing History</h2>
              {dataSourceConfig?.reservations != null && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  Source: {getProviderLabelWithTable(dataSourceConfig.reservations, dataSourceConfig.reservationsTable)}
                </span>
              )}
            </div>
            {dataSourceNotConfigured.reservations ? (
              <DataSourceNotConfiguredEmptyState layerLabel="Reservations" className="min-h-[200px]" />
            ) : (
            <>
            <p className="text-sm text-slate-500 mb-4">All reservations in your company.</p>
            <div className="flex flex-wrap gap-x-3 gap-y-3 p-4 mb-4 bg-slate-50 rounded-xl border border-slate-200/80 items-end">
              <span className="text-sm font-semibold text-slate-600 pb-2">Filters:</span>
              <input
                type="text"
                placeholder="Car (brand or reg.)"
                value={historyFilterCar}
                onChange={(e) => setHistoryFilterCar(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-[140px] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary-ring)] outline-none"
              />
              <input
                type="text"
                placeholder="User (name or email)"
                value={historyFilterUser}
                onChange={(e) => setHistoryFilterUser(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-[140px] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary-ring)] outline-none"
              />
              <div className="flex flex-col gap-1 min-w-[11rem]">
                <label htmlFor="history-filter-date-from" className="text-xs font-semibold text-slate-700 leading-tight">
                  Reservation start — earliest day
                </label>
                <span className="text-[11px] text-slate-500 leading-snug">Include trips whose “Reserved at” date is this day or later</span>
                <input
                  id="history-filter-date-from"
                  type="date"
                  value={historyFilterDateFrom}
                  onChange={(e) => setHistoryFilterDateFrom(e.target.value)}
                  title="Lower bound for the reservation start date (Reserved at column)"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary-ring)] outline-none"
                />
              </div>
              <div className="flex flex-col gap-1 min-w-[11rem]">
                <label htmlFor="history-filter-date-to" className="text-xs font-semibold text-slate-700 leading-tight">
                  Reservation start — latest day
                </label>
                <span className="text-[11px] text-slate-500 leading-snug">Include trips whose “Reserved at” date is this day or earlier</span>
                <input
                  id="history-filter-date-to"
                  type="date"
                  value={historyFilterDateTo}
                  onChange={(e) => setHistoryFilterDateTo(e.target.value)}
                  title="Upper bound for the reservation start date (Reserved at column)"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary-ring)] outline-none"
                />
              </div>
              <select
                value={historyFilterStatus}
                onChange={(e) => setHistoryFilterStatus(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary-ring)] outline-none"
              >
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              <input
                type="text"
                placeholder="Purpose"
                value={historyFilterPurpose}
                onChange={(e) => setHistoryFilterPurpose(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-[120px] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary-ring)] outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setHistoryFilterCar("");
                  setHistoryFilterUser("");
                  setHistoryFilterDateFrom("");
                  setHistoryFilterDateTo("");
                  setHistoryFilterStatus("");
                  setHistoryFilterPurpose("");
                }}
                className="px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
              >
                Clear filters
              </button>
            </div>
            <div className="w-full overflow-x-auto rounded-xl border border-slate-200/80 shadow-sm">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="py-4 px-4 font-semibold text-slate-700">Car</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">User</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Reserved at</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Status</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Start / End code</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {filteredHistory.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-4">{r.car?.brand} {r.car?.registrationNumber}</td>
                      <td className="py-4 px-4">{r.user?.name || r.user?.email || "—"}</td>
                      <td className="py-4 px-4">{formatDate(r.startDate)}</td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                          (r.status || "").toLowerCase() === "active" ? "bg-emerald-100 text-emerald-800" :
                          (r.status || "").toLowerCase() === "completed" ? "bg-[var(--primary)]/10 text-[var(--primary)]" :
                          (r.status || "").toLowerCase() === "cancelled" ? "bg-red-100 text-red-800" :
                          "bg-slate-100 text-slate-800"
                        }`}>{r.status}</span>
                      </td>
                      <td className="py-4 px-4">
                        {r.pickup_code != null || r.release_code != null || (r.status || "").toLowerCase() === "active" ? (
                          <div className="flex flex-col gap-2 items-start">
                            <span className="inline-flex flex-wrap items-center gap-1.5 font-mono text-sm tabular-nums">
                              <span className={ACCESS_CODE_SLOT_CLASS} title="Start rental">
                                {r.pickup_code != null ? r.pickup_code : <span className="text-slate-400">—</span>}
                              </span>
                              <span className="text-slate-300">/</span>
                              <span className={ACCESS_CODE_SLOT_CLASS} title="End rental">
                                {r.release_code != null ? r.release_code : <span className="text-slate-400">—</span>}
                              </span>
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {r.pickup_code != null && <AccessCodeQRButton code={r.pickup_code} label="QR start" />}
                              {r.release_code != null && <AccessCodeQRButton code={r.release_code} label="QR end" />}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {(r.status || "").toLowerCase() === "active" ? (
                          <button
                            type="button"
                            onClick={() => handleRefreshCodes(r.id)}
                            disabled={refreshingCodeId === r.id}
                            className="px-2 py-1 text-xs font-semibold text-[#1E293B] border border-[#1E293B]/30 rounded-lg hover:bg-[#1E293B]/10 disabled:opacity-50"
                          >
                            {refreshingCodeId === r.id ? "…" : "Generate New Code"}
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredHistory.length === 0 && !loading && (
                    <tr><td colSpan={6} className="py-10 px-4 text-center text-slate-500">{reservations.length === 0 ? "No reservations yet" : "No reservations match the filters"}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            </>
            )}
          </section>
        )}

        {section === "aiVerification" && (() => {
          const showDriving = aiValidationConfig.drivingEnabled;
          const showFace = !aiValidationConfig.drivingEnabled && aiValidationConfig.faceEnabled;
          const aiUsers = users.filter((m) => {
            if (showDriving) return m.drivingLicenceStatus != null || m.drivingLicenceVerifiedBy != null;
            if (showFace) return m.identityStatus != null || m.identityVerifiedBy != null;
            return false;
          });
          const aiDrivingApproved = aiUsers.filter((m) => m.drivingLicenceStatus === "APPROVED");
          const aiDrivingRejected = aiUsers.filter((m) => m.drivingLicenceStatus === "REJECTED");
          const aiFaceApproved = aiUsers.filter((m) => m.identityStatus === "VERIFIED");
          const aiFaceRejected = aiUsers.filter((m) => m.identityStatus === "REJECTED");
          return (
          <section className="w-full min-w-0">
            <div className="mb-4 p-5 sm:p-6 rounded-xl bg-[#1E293B] text-white border border-slate-600/50 shadow-sm">
              <div className="flex items-start gap-4">
                <div
                  className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center border border-cyan-400/25 shadow-inner"
                  style={{
                    background: "linear-gradient(145deg, rgba(34,211,238,0.22) 0%, rgba(139,92,246,0.2) 100%)",
                  }}
                  aria-hidden
                >
                  <FileScan className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-100" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-cyan-100 mb-1">AI Verification</h2>
                  <p className="text-sm text-slate-200">
                    Enable one mode at a time: Driving mode shows only driving-licence requests, Face mode shows only face-recognition requests.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 mt-3">
                <span className="px-3 py-1 rounded-lg bg-emerald-600/20 text-emerald-300 text-sm font-semibold">
                  DL: {aiDrivingApproved.length} Approved
                </span>
                <span className="px-3 py-1 rounded-lg bg-red-600/20 text-red-300 text-sm font-semibold">
                  DL: {aiDrivingRejected.length} Rejected
                </span>
                <span className="px-3 py-1 rounded-lg bg-emerald-600/20 text-emerald-300 text-sm font-semibold">
                  Face: {aiFaceApproved.length} Approved
                </span>
                <span className="px-3 py-1 rounded-lg bg-red-600/20 text-red-300 text-sm font-semibold">
                  Face: {aiFaceRejected.length} Rejected
                </span>
                <span className="px-3 py-1 rounded-lg bg-slate-600/30 text-slate-300 text-sm font-semibold">{aiUsers.length} Total</span>
              </div>
            </div>
            <div className="mb-6 p-4 rounded-xl bg-white border border-slate-200/80 shadow-sm">
              <p className="text-sm font-semibold text-slate-700 mb-3">AI validation controls</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={aiConfigSaving}
                  onClick={() => setAiValidationMode("driving")}
                  className={`px-3 py-2 text-sm font-semibold rounded-xl shadow-sm transition-colors ${
                    aiValidationConfig.drivingEnabled
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                  } disabled:opacity-60`}
                >
                  AI Driving: {aiValidationConfig.drivingEnabled ? "ON" : "OFF"}
                </button>
                <button
                  type="button"
                  disabled={aiConfigSaving}
                  onClick={() => setAiValidationMode("face")}
                  className={`px-3 py-2 text-sm font-semibold rounded-xl shadow-sm transition-colors ${
                    aiValidationConfig.faceEnabled
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                  } disabled:opacity-60`}
                >
                  AI Face: {aiValidationConfig.faceEnabled ? "ON" : "OFF"}
                </button>
              </div>
            </div>
            {aiUsers.length === 0 ? (
              <div className="p-6 rounded-xl border border-slate-200/80 bg-white shadow-sm">
                <p className="text-slate-500">
                  {showFace
                    ? "No face-recognition requests found yet."
                    : "No driving-licence requests found yet."}
                </p>
              </div>
            ) : (
              <div className="w-full bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="py-4 px-4 font-semibold text-slate-700">User</th>
                      <th className="py-4 px-4 font-semibold text-slate-700">Email</th>
                      {showDriving && <th className="py-4 px-4 font-semibold text-slate-700">Driving</th>}
                      {showFace && <th className="py-4 px-4 font-semibold text-slate-700">Face</th>}
                      <th className="py-4 px-4 font-semibold text-slate-700">Photo</th>
                      <th className="py-4 px-4 font-semibold text-slate-700">Admin Override</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-800">
                    {aiUsers.map((m) => (
                      <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50/80 transition-colors">
                        <td className="py-4 px-4 font-medium">{m.name}</td>
                        <td className="py-4 px-4 text-slate-600">{m.email}</td>
                        {showDriving && <td className="py-4 px-4 align-top">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                            m.drivingLicenceStatus === "APPROVED" ? "bg-emerald-100 text-emerald-800" :
                            m.drivingLicenceStatus === "REJECTED" ? "bg-red-100 text-red-800" :
                            "bg-amber-100 text-amber-800"
                          }`}>
                            {m.drivingLicenceStatus === "APPROVED" ? "Approved" : m.drivingLicenceStatus === "REJECTED" ? "Rejected" : "Pending"}
                          </span>
                          <span className="ml-2 text-[11px] text-slate-500">
                            {m.drivingLicenceVerifiedBy || ""}
                          </span>
                        </td>}
                        {showFace && <td className="py-4 px-4 align-top">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                            m.identityStatus === "VERIFIED" ? "bg-emerald-100 text-emerald-800" :
                            m.identityStatus === "REJECTED" ? "bg-red-100 text-red-800" :
                            "bg-amber-100 text-amber-800"
                          }`}>
                            {m.identityStatus === "VERIFIED" ? "Approved" : m.identityStatus === "REJECTED" ? "Rejected" : (m.identityStatus || "Pending")}
                          </span>
                          <span className="ml-2 text-[11px] text-slate-500">
                            {m.identityVerifiedBy || ""}
                          </span>
                        </td>}
                        <td className="py-4 px-4">
                          <div className="inline-flex flex-wrap gap-1">
                            {showDriving && m.drivingLicenceUrl && (
                              <button type="button" onClick={() => setDlImageModal(m.drivingLicenceUrl)} className="px-3 py-1.5 text-xs font-semibold text-white bg-[var(--primary)] rounded-lg hover:bg-[var(--primary-hover)] transition-colors shadow-sm">
                                View DL
                              </button>
                            )}
                            {showFace && m.selfieUrl && (
                              <button type="button" onClick={() => setDlImageModal(m.selfieUrl)} className="px-3 py-1.5 text-xs font-semibold text-white bg-[#334155] rounded-lg hover:bg-[#1E293B] transition-colors shadow-sm">
                                View Face
                              </button>
                            )}
                            {((showDriving && !m.drivingLicenceUrl) || (showFace && !m.selfieUrl)) && (
                              <span className="text-xs text-slate-400">No photo</span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="inline-flex flex-wrap gap-1">
                            {showDriving && m.drivingLicenceStatus !== "APPROVED" && (
                              <button type="button" onClick={() => handleDlStatus(m.userId, "APPROVED")} className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">Approve</button>
                            )}
                            {showDriving && m.drivingLicenceStatus !== "REJECTED" && (
                              <button type="button" onClick={() => handleDlStatus(m.userId, "REJECTED")} className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Reject</button>
                            )}
                            {showFace && m.identityStatus !== "VERIFIED" && (
                              <button type="button" onClick={() => handleIdentityStatus(m.userId, "VERIFIED")} className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">Face Approve</button>
                            )}
                            {showFace && m.identityStatus !== "REJECTED" && (
                              <button type="button" onClick={() => handleIdentityStatus(m.userId, "REJECTED")} className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Face Reject</button>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          );
        })()}

        {section === "maintenance" && (
          <section className="w-full min-w-0 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-6 max-w-3xl">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Add service record</h3>
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!maintCarId || !maintServiceType.trim()) {
                    setError("Select a car and enter service type.");
                    return;
                  }
                  setMaintSaving(true);
                  setError("");
                  try {
                    const performedAt = maintPerformedAt
                      ? new Date(maintPerformedAt).toISOString()
                      : new Date().toISOString();
                    const mileageKm =
                      maintMileageKm.trim() === "" ? null : parseInt(maintMileageKm, 10);
                    const cost =
                      maintCost.trim() === "" ? null : parseFloat(String(maintCost).replace(",", "."));
                    await apiMaintenanceCreate({
                      carId: maintCarId,
                      performedAt,
                      mileageKm: mileageKm != null && !Number.isNaN(mileageKm) ? mileageKm : null,
                      serviceType: maintServiceType.trim(),
                      cost: cost != null && !Number.isNaN(cost) ? cost : null,
                      notes: maintNotes.trim() || null,
                    });
                    setMaintServiceType("");
                    setMaintMileageKm("");
                    setMaintCost("");
                    setMaintNotes("");
                    await loadMaintenance();
                    await load();
                  } catch (err) {
                    setError(err.message || "Failed to save");
                  } finally {
                    setMaintSaving(false);
                  }
                }}
              >
                <label className="sm:col-span-2 block text-xs font-medium text-slate-600">
                  Vehicle
                  <select
                    value={maintCarId}
                    onChange={(e) => setMaintCarId(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    required
                  >
                    <option value="">—</option>
                    {cars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.brand} {c.registrationNumber}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Date & time
                  <input
                    type="datetime-local"
                    value={maintPerformedAt}
                    onChange={(e) => setMaintPerformedAt(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Odometer (km)
                  <input
                    type="number"
                    min={0}
                    value={maintMileageKm}
                    onChange={(e) => setMaintMileageKm(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    placeholder="Optional"
                  />
                </label>
                <label className="sm:col-span-2 block text-xs font-medium text-slate-600">
                  Service type
                  <input
                    type="text"
                    value={maintServiceType}
                    onChange={(e) => setMaintServiceType(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    placeholder="e.g. Oil change, brakes"
                    required
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Cost (optional)
                  <input
                    type="text"
                    value={maintCost}
                    onChange={(e) => setMaintCost(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    placeholder="0"
                  />
                </label>
                <label className="sm:col-span-2 block text-xs font-medium text-slate-600">
                  Notes
                  <textarea
                    value={maintNotes}
                    onChange={(e) => setMaintNotes(e.target.value)}
                    rows={2}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    placeholder="Optional"
                  />
                </label>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={maintSaving}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50"
                  >
                    {maintSaving ? "Saving…" : "Add record"}
                  </button>
                </div>
              </form>
            </div>

            {!maintenanceLoading && maintenanceEvents.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Filter className="h-4 w-4 text-slate-500 shrink-0" aria-hidden />
                  {t("maintenanceFilters.title")}
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block text-xs font-medium text-slate-600">
                    {t("maintenanceFilters.vehicle")}
                    <select
                      value={maintFilterCarId}
                      onChange={(e) => setMaintFilterCarId(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                    >
                      <option value="">{t("maintenanceFilters.allVehicles")}</option>
                      {cars.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.brand} {c.registrationNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    {t("maintenanceFilters.dateFrom")}
                    <input
                      type="date"
                      value={maintFilterDateFrom}
                      onChange={(e) => setMaintFilterDateFrom(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    {t("maintenanceFilters.dateTo")}
                    <input
                      type="date"
                      value={maintFilterDateTo}
                      onChange={(e) => setMaintFilterDateTo(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-600 sm:col-span-2 lg:col-span-1">
                    {t("maintenanceFilters.serviceContains")}
                    <input
                      type="text"
                      value={maintFilterService}
                      onChange={(e) => setMaintFilterService(e.target.value)}
                      placeholder={t("maintenanceFilters.servicePlaceholder")}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const end = new Date();
                      const start = new Date();
                      start.setDate(start.getDate() - 30);
                      setMaintFilterDateFrom(toYmdLocal(start));
                      setMaintFilterDateTo(toYmdLocal(end));
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
                  >
                    {t("maintenanceFilters.preset30")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const end = new Date();
                      const start = new Date();
                      start.setDate(start.getDate() - 90);
                      setMaintFilterDateFrom(toYmdLocal(start));
                      setMaintFilterDateTo(toYmdLocal(end));
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
                  >
                    {t("maintenanceFilters.preset90")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const start = new Date(now.getFullYear(), 0, 1);
                      const end = new Date(now.getFullYear(), 11, 31);
                      setMaintFilterDateFrom(toYmdLocal(start));
                      setMaintFilterDateTo(toYmdLocal(end));
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
                  >
                    {t("maintenanceFilters.presetYear")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMaintFilterCarId("");
                      setMaintFilterDateFrom("");
                      setMaintFilterDateTo("");
                      setMaintFilterService("");
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    {t("maintenanceFilters.clear")}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {t("maintenanceFilters.activeHint", {
                    count: filteredMaintenanceEvents.length,
                    total: maintenanceEvents.length,
                  })}
                </p>
              </div>
            )}

            {!maintenanceLoading && maintenanceStats.totalEvents > 0 && (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">{t("maintenanceStats.title")}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{t("maintenanceStats.exportHint")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={downloadMaintenanceCsv}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden />
                      {t("maintenanceStats.downloadCsv")}
                    </button>
                    <button
                      type="button"
                      onClick={downloadMaintenancePdf}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden />
                      {t("maintenanceStats.downloadPdf")}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("maintenanceStats.totalRecords")}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{maintenanceStats.totalEvents}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("maintenanceStats.totalCost")}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                      {maintenanceStats.costCount > 0 ? formatCurrency(maintenanceStats.totalCost) : "—"}
                    </p>
                    {maintenanceStats.costCount > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        {t("maintenanceStats.avgCost")}: {formatCurrency(maintenanceStats.avgCost)}
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("maintenanceStats.last12Title")}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{maintenanceStats.countLast12Months}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {t("maintenanceStats.costLabel")}{" "}
                      {maintenanceStats.totalCostLast12 > 0 ? formatCurrency(maintenanceStats.totalCostLast12) : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm col-span-2 lg:col-span-1">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("maintenanceStats.withCost")}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                      {maintenanceStats.costCount} / {maintenanceStats.totalEvents}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{t("maintenanceStats.withCostHint")}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-800 mb-3">{t("maintenanceStats.byYearTitle")}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {maintenanceStats.yearBuckets.map((yb, idx) => (
                      <div
                        key={yb.year}
                        className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm"
                      >
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                          {idx === 0
                            ? t("maintenanceStats.yearThis", { year: yb.year })
                            : idx === 1
                              ? t("maintenanceStats.yearLast", { year: yb.year })
                              : t("maintenanceStats.yearTwoAgo", { year: yb.year })}
                        </p>
                        <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{yb.count}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          {t("maintenanceStats.yearCostLine")}{" "}
                          {yb.totalCost > 0 ? formatCurrency(yb.totalCost) : "—"}
                          {yb.costCount > 0 && (
                            <span className="text-slate-500">
                              {" "}
                              ({t("maintenanceStats.yearAvgShort")}: {formatCurrency(yb.avgCost)})
                            </span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-800 mb-3">{t("maintenanceStats.last6Months")}</p>
                    <div className="flex items-end gap-1.5 min-h-[112px]">
                      {(() => {
                        const maxC = Math.max(1, ...maintenanceStats.monthBuckets.map((x) => x.count));
                        const barMaxPx = 72;
                        return maintenanceStats.monthBuckets.map((b) => {
                          const px = Math.max(6, Math.round((b.count / maxC) * barMaxPx));
                          return (
                            <div key={b.key} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                              <div
                                className="w-full rounded-t-md bg-[var(--primary)]/80 transition-all"
                                style={{ height: `${px}px` }}
                                title={`${b.label}: ${b.count}`}
                              />
                              <span className="text-[10px] text-slate-500 truncate w-full text-center" title={b.label}>
                                {b.label}
                              </span>
                              <span className="text-xs font-semibold text-slate-800">{b.count}</span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{t("maintenanceStats.last6Hint")}</p>
                  </div>

                  <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-800 mb-3">{t("maintenanceStats.topVehicles")}</p>
                    {maintenanceStats.topCars.length === 0 ? (
                      <p className="text-sm text-slate-500">—</p>
                    ) : (
                      <ul className="space-y-2">
                        {maintenanceStats.topCars.map((row, idx) => (
                          <li
                            key={row.carId}
                            className="flex items-center justify-between gap-2 text-sm border-b border-slate-100 pb-2 last:border-0 last:pb-0"
                          >
                            <span className="text-slate-700 truncate">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 mr-2">
                                {idx + 1}
                              </span>
                              {row.label}
                            </span>
                            <span className="shrink-0 font-semibold text-slate-900 tabular-nums">
                              {row.count}
                              {row.costSum > 0 ? (
                                <span className="text-slate-500 font-normal ml-1">({formatCurrency(row.costSum)})</span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            {maintenanceLoading ? (
              <p className="text-slate-500">Loading…</p>
            ) : (
              <div className="w-full bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="py-3 px-4 font-semibold text-slate-700">Date</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Vehicle</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Service</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Km</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Cost</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Notes</th>
                      <th className="py-3 px-4 font-semibold text-slate-700" />
                    </tr>
                  </thead>
                  <tbody>
                    {maintenanceEvents.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 px-4 text-center text-slate-500 text-sm">
                          No maintenance records yet.
                        </td>
                      </tr>
                    ) : filteredMaintenanceEvents.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 px-4 text-center text-slate-500 text-sm">
                          {t("maintenanceFilters.noMatch")}
                        </td>
                      </tr>
                    ) : (
                      filteredMaintenanceEvents.map((ev) => (
                        <tr key={ev.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                          <td className="py-3 px-4 text-sm text-slate-800">{formatDate(ev.performedAt)}</td>
                          <td className="py-3 px-4 text-sm">
                            {ev.car?.brand} {ev.car?.registrationNumber}
                          </td>
                          <td className="py-3 px-4 text-sm">{ev.serviceType}</td>
                          <td className="py-3 px-4 text-sm">{ev.mileageKm ?? "—"}</td>
                          <td className="py-3 px-4 text-sm">
                            {ev.cost != null ? formatNumber(ev.cost, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : "—"}
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-600 max-w-[200px] truncate" title={ev.notes || ""}>
                            {ev.notes || "—"}
                          </td>
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={async () => {
                                if (!confirm("Delete this maintenance record?")) return;
                                try {
                                  await apiMaintenanceDelete(ev.id);
                                  await loadMaintenance();
                                } catch (err) {
                                  setError(err.message || "Delete failed");
                                }
                              }}
                              className="text-xs font-semibold text-red-600 hover:underline"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {section === "auditLogs" && (
          <section className="w-full min-w-0">
            <AuditLogsSection />
          </section>
        )}

        {loading && <p className="text-slate-500">Loading…</p>}
        </main>
      </div>

      {/* Driving licence image modal */}
      {dlImageModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setDlImageModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-auto p-4 border border-slate-100" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-semibold text-slate-800">Driving licence</h3>
              <button type="button" onClick={() => setDlImageModal(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-700 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors" aria-label="Close">✕</button>
            </div>
            <img src={dlImageModal} alt="Driving licence" className="w-full h-auto rounded-xl border border-slate-200" />
          </div>
        </div>
      )}

      {/* Add User modal – create user directly (Local DB or SQL Server) */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-slate-800">Add User</h3>
              <button type="button" onClick={() => setShowAddUser(false)} className="text-2xl text-slate-500 hover:text-slate-800 transition-colors">&times;</button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Create a new user. They will appear in the list. For Local DB a default password is used if left empty.</p>
            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                  placeholder="user@company.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Name</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                  placeholder="John Doe"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Password (optional)</label>
                <input
                  type="password"
                  value={addUserPassword}
                  onChange={(e) => setAddUserPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                  placeholder="Min 6 characters; empty = default for Local"
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Role</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none">
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowAddUser(false)} className="px-4 py-2 bg-slate-100 text-slate-800 font-semibold rounded-xl hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-[var(--primary)] text-white font-semibold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-sm transition-colors">
                  {submitting ? "Creating…" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
