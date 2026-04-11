"use client";

import { useState, useEffect, Fragment, useMemo } from "react";
import Link from "next/link";
import {
  LayoutGrid,
  IdCard,
  Car,
  Wrench,
  Calendar,
  History,
  CalendarDays,
  Shield,
  Info,
  AlertTriangle,
  FolderOpen,
  FileDown,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Sidebar, NavItem, NavSection, NavLabel } from "./Sidebar";
import FleetBookingCalendar from "./FleetBookingCalendar";
import AccessCodeQRButton, { ACCESS_CODE_SLOT_CLASS } from "./AccessCodeQRButton";
import {
  apiCars,
  apiGetCar,
  apiReservations,
  apiReservationHistory,
  apiCreateReservation,
  apiCancelReservation,
  apiReleaseReservation,
  apiExtendReservation,
  apiUploadDrivingLicence,
  apiDeleteDrivingLicence,
  apiCreateMobileCaptureSession,
  apiIncidentsList,
  apiIncidentCreate,
  apiIncidentAddAttachments,
  apiUserMfaUpdate,
  apiUserEmailNotifications,
  apiUserCalendarFeedUrl,
  apiUserCalendarFeedRotate,
  apiUserCalendarFeedDisable,
  apiGloveboxActive,
  downloadJourneySheetPdf,
} from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";
import LanguageCurrencySwitcher from "@/components/LanguageCurrencySwitcher";

const UICON = { s: "w-4 h-4 shrink-0 stroke-[1.5]" };

const USER_PAGE_META_KEYS = {
  dashboard: "userDashboard",
  drivingLicence: "userDrivingLicence",
  security: "userSecurity",
  myReservations: "userMyReservations",
  bookingCalendar: "userBookingCalendar",
  availableCars: "userAvailableCars",
  unavailableCars: "userUnavailableCars",
  history: "userHistory",
  incidents: "userIncidents",
  glovebox: "userGlovebox",
};

const USER_TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "Europe/Bucharest"; }
})();

function formatDate(d) {
  if (!d) return "—";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "—";
  return x.toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short", timeZone: USER_TZ });
}

function formatDateOnly(d) {
  if (!d) return "—";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "—";
  return x.toLocaleDateString("ro-RO", { timeZone: USER_TZ });
}

const PICKUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

/** Pickup code status: pending (before window), active (within 30 min), expired (after window). */
function getPickupCodeStatus(reservation, now = new Date()) {
  if (!reservation?.pickup_code || (reservation.status || "").toLowerCase() !== "active") return null;
  const effectiveStart = reservation.code_valid_from ? new Date(reservation.code_valid_from) : new Date(reservation.startDate);
  const windowEnd = new Date(effectiveStart.getTime() + PICKUP_WINDOW_MS);
  let status, countdownText;
  if (now < effectiveStart) {
    status = "pending";
    const ms = effectiveStart - now;
    const mins = Math.floor(ms / 60000);
    const hours = Math.floor(mins / 60);
    countdownText = hours >= 1 ? `Starts in ${hours}h ${mins % 60}m` : `Starts in ${mins}m`;
  } else if (now <= windowEnd) {
    status = "active";
    const ms = windowEnd - now;
    const mins = Math.ceil(ms / 60000);
    countdownText = `Valid for ${mins} min`;
  } else {
    status = "expired";
    countdownText = "Window closed";
  }
  return { status, effectiveStart, windowEnd, countdownText };
}

function statusClass(s) {
  const v = (s || "").toLowerCase();
  if (v === "available" || v === "active") return "bg-emerald-100 text-emerald-800";
  if (v === "completed") return "bg-[var(--primary)]/10 text-[var(--primary)]";
  if (v === "reserved") return "bg-amber-100 text-amber-800";
  if (v === "cancelled") return "bg-red-100 text-red-800";
  if (v === "in_maintenance" || v === "maintenance") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-800";
}

export default function UserDashboard({ user, company, onUserUpdated, viewAs, setViewAs }) {
  const { t, formatNumber } = useI18n();
  const [section, setSection] = useState("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cars, setCars] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reservingCarId, setReservingCarId] = useState(null);
  const [releaseModal, setReleaseModal] = useState(null);
  const [releaseNewKm, setReleaseNewKm] = useState("");
  const [releaseExceededReason, setReleaseExceededReason] = useState("");
  const [releaseSubmitting, setReleaseSubmitting] = useState(false);
  const [dlUploading, setDlUploading] = useState(false);
  const [dlDeleting, setDlDeleting] = useState(false);
  const [selectedDlFile, setSelectedDlFile] = useState(null);
  const [dlPreviewUrl, setDlPreviewUrl] = useState(null);
  const [dlNotice, setDlNotice] = useState(null);
  const [identityNotice, setIdentityNotice] = useState(null);
  const [mobileCaptureSession, setMobileCaptureSession] = useState(null);
  const [mobileCaptureBusy, setMobileCaptureBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [scheduleModal, setScheduleModal] = useState(null);
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [schedulePurpose, setSchedulePurpose] = useState("");
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [icsDownloadingId, setIcsDownloadingId] = useState(null);
  const [mfaPassword, setMfaPassword] = useState("");
  const [mfaSaving, setMfaSaving] = useState(false);
  const [mfaNotice, setMfaNotice] = useState(null);
  const [emailNotifSaving, setEmailNotifSaving] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarUrl, setCalendarUrl] = useState("");
  const [calendarMsg, setCalendarMsg] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [incidentCarId, setIncidentCarId] = useState("");
  const [incidentOccurredAt, setIncidentOccurredAt] = useState("");
  const [incidentSeverity, setIncidentSeverity] = useState("C");
  const [incidentTitle, setIncidentTitle] = useState("");
  const [incidentLocation, setIncidentLocation] = useState("");
  const [incidentDescription, setIncidentDescription] = useState("");
  const [incidentSubmitting, setIncidentSubmitting] = useState(false);
  const [incidentStep, setIncidentStep] = useState(0);
  const [incidentSceneFiles, setIncidentSceneFiles] = useState([]);
  const [incidentOwnFiles, setIncidentOwnFiles] = useState([]);
  const [incidentOtherFiles, setIncidentOtherFiles] = useState([]);
  const [incidentPlateFiles, setIncidentPlateFiles] = useState([]);
  const [incidentDocFiles, setIncidentDocFiles] = useState([]);
  const [glovebox, setGlovebox] = useState(null);
  const [gloveboxLoading, setGloveboxLoading] = useState(false);
  const [journeyPdfLoadingId, setJourneyPdfLoadingId] = useState(null);
  const dlStatus = user?.drivingLicenceStatus ?? null;
  const identityStatus = user?.identityStatus ?? null;
  const canReserve = dlStatus === "APPROVED";

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [carsRes, resRes, histRes] = await Promise.all([
        apiCars(),
        apiReservations({ mine: true }),
        apiReservationHistory(),
      ]);
      setCars(Array.isArray(carsRes) ? carsRes : []);
      setReservations(Array.isArray(resRes) ? resRes : []);
      setHistory(Array.isArray(histRes) ? histRes : []);
    } catch (err) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function loadIncidents() {
    setIncidentLoading(true);
    setError("");
    try {
      const list = await apiIncidentsList();
      setIncidents(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err.message || "Failed to load incidents");
    } finally {
      setIncidentLoading(false);
    }
  }

  useEffect(() => {
    if (section === "incidents") loadIncidents();
  }, [section]);

  useEffect(() => {
    if (section !== "glovebox") return undefined;
    let cancelled = false;
    (async () => {
      setGloveboxLoading(true);
      setError("");
      try {
        const data = await apiGloveboxActive();
        if (!cancelled) setGlovebox(data);
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load glovebox");
      } finally {
        if (!cancelled) setGloveboxLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [section]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const availableCars = cars.filter((c) => (c.status || "").toLowerCase() === "available");
  const unavailableCars = cars.filter((c) => (c.status || "").toLowerCase() !== "available");
  const activeReservations = reservations.filter((r) => (r.status || "").toLowerCase() === "active");

  async function reserveInstant(carId) {
    setReservingCarId(carId);
    setError("");
    try {
      await apiCreateReservation(carId);
      load();
    } catch (err) {
      setError(err.message || "Failed to reserve");
    } finally {
      setReservingCarId(null);
    }
  }

  function openScheduleModal(car) {
    const start = new Date();
    start.setMinutes(start.getMinutes() + 30);
    const end = new Date(start);
    end.setHours(end.getHours() + 2);
    setScheduleModal(car || null);
    setScheduleStart(start.toISOString().slice(0, 16));
    setScheduleEnd(end.toISOString().slice(0, 16));
    setSchedulePurpose("");
    setScheduleSubmitting(false);
  }

  async function submitSchedule(e) {
    e.preventDefault();
    if (!scheduleModal?.id) return;
    setScheduleSubmitting(true);
    setError("");
    try {
      const start = new Date(scheduleStart).toISOString();
      const end = new Date(scheduleEnd).toISOString();
      if (new Date(scheduleEnd) <= new Date(scheduleStart)) {
        setError("End must be after start");
        setScheduleSubmitting(false);
        return;
      }
      if (new Date(scheduleStart).getTime() < Date.now()) {
        setError("Start must be now or in the future");
        setScheduleSubmitting(false);
        return;
      }
      await apiCreateReservation(scheduleModal.id, schedulePurpose || null, start, end);
      setScheduleModal(null);
      load();
    } catch (err) {
      setError(err.message || "Failed to book");
    } finally {
      setScheduleSubmitting(false);
    }
  }

  async function downloadReservationIcs(reservationId) {
    setIcsDownloadingId(reservationId);
    setError("");
    try {
      const res = await fetch(`/api/reservations/${reservationId}/calendar`, { credentials: "include" });
      if (!res.ok) {
        let msg = "Could not download calendar";
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const filename = `reservation-${reservationId.slice(0, 8)}.ics`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || "Could not download calendar file");
    } finally {
      setIcsDownloadingId(null);
    }
  }

  async function cancelRes(id) {
    try {
      await apiCancelReservation(id);
      load();
    } catch (err) {
      setError(err.message || "Failed to cancel");
    }
  }

  function handleDlFileSelect(e) {
    const file = e.target.files?.[0];
    if (dlPreviewUrl) URL.revokeObjectURL(dlPreviewUrl);
    setDlPreviewUrl(null);
    setSelectedDlFile(null);
    if (!file) return;
    setSelectedDlFile(file);
    setDlPreviewUrl(URL.createObjectURL(file));
    e.target.value = "";
  }

  useEffect(() => {
    return () => { if (dlPreviewUrl) URL.revokeObjectURL(dlPreviewUrl); };
  }, [dlPreviewUrl]);


  async function handleDlSave() {
    if (!selectedDlFile) return;
    setDlUploading(true);
    setError("");
    setDlNotice(null);
    try {
      const data = await apiUploadDrivingLicence(selectedDlFile);
      if (dlPreviewUrl) URL.revokeObjectURL(dlPreviewUrl);
      setDlPreviewUrl(null);
      setSelectedDlFile(null);
      onUserUpdated?.();
      if (data.aiVerified) {
        const s = data.drivingLicenceStatus;
        setDlNotice({
          type: s === "APPROVED" ? "success" : "warning",
          text:
            s === "APPROVED"
              ? "Automatic AI check: approved (meets experience rules)."
              : "Automatic AI check: not approved from this image (e.g. experience under 2 years or unreadable). You can upload a clearer photo or ask an admin.",
        });
      } else {
        setDlNotice({
          type: "warn",
          text:
            data.message ||
            "Photo saved, but the AI service did not respond. Status is pending until an admin reviews or you try again.",
        });
      }

      try {
        setMobileCaptureBusy(true);
        const mobile = await apiCreateMobileCaptureSession();
        setMobileCaptureSession(mobile);
      } catch (mobileErr) {
        setIdentityNotice({
          type: "warning",
          text:
            mobileErr?.message ||
            "Driving licence uploaded, but mobile verification link could not be created yet. Please try Generate link below.",
        });
      } finally {
        setMobileCaptureBusy(false);
      }
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setDlUploading(false);
    }
  }

  async function handleDlDelete() {
    if (!user?.drivingLicenceUrl) return;
    setDlDeleting(true);
    setError("");
    try {
      await apiDeleteDrivingLicence();
      setMobileCaptureSession(null);
      onUserUpdated?.();
    } catch (err) {
      setError(err.message || "Delete failed");
    } finally {
      setDlDeleting(false);
    }
  }

  async function createOrEmailMobileLink(sendEmail = false) {
    setMobileCaptureBusy(true);
    setError("");
    setIdentityNotice(null);
    try {
      const data = await apiCreateMobileCaptureSession({ sendEmail });
      setMobileCaptureSession(data);
      if (sendEmail) {
        if (data?.email?.sent) {
          setIdentityNotice({ type: "success", text: "Verification link sent to your email. Open it on your phone and capture your face photo." });
        } else {
          setIdentityNotice({
            type: "warning",
            text: data?.email?.error ? `Could not send email: ${data.email.error}` : "Could not send email right now. You can still use the QR code.",
          });
        }
      }
    } catch (err) {
      setError(err?.message || "Failed to create mobile verification link");
    } finally {
      setMobileCaptureBusy(false);
    }
  }


  async function handleMfaToggle(enable) {
    if (!mfaPassword.trim()) {
      setError(t("userSecurityForm.passwordRequired"));
      return;
    }
    setMfaSaving(true);
    setError("");
    setMfaNotice(null);
    try {
      await apiUserMfaUpdate(enable, mfaPassword);
      setMfaPassword("");
      setMfaNotice({
        type: "success",
        text: enable ? t("userSecurityForm.enabledOk") : t("userSecurityForm.disabledOk"),
      });
      onUserUpdated?.();
    } catch (err) {
      setError(err.message || "Failed");
    } finally {
      setMfaSaving(false);
    }
  }

  const defaultKm = company?.defaultKmUsage ?? 100;

  function openReleaseModal(r) {
    setReleaseModal({ id: r.id, car: r.car });
    setReleaseNewKm("");
    setReleaseExceededReason("");
  }

  const releaseCurrentKm = releaseModal?.car?.km ?? 0;
  const releaseKmUsed = (() => {
    const n = parseInt(releaseNewKm, 10);
    if (isNaN(n) || n < releaseCurrentKm) return null;
    return n - releaseCurrentKm;
  })();
  const releaseExceedsLimit = defaultKm != null && releaseKmUsed != null && releaseKmUsed > defaultKm;

  async function submitRelease(e) {
    e.preventDefault();
    if (!releaseModal) return;
    const newKm = parseInt(releaseNewKm, 10);
    if (isNaN(newKm) || newKm < 0) {
      setError("Please enter the current odometer reading (new km of the car).");
      return;
    }
    if (newKm < releaseCurrentKm) {
      setError(
        "Odometer must be greater than or equal to the last known reading (" +
          releaseCurrentKm +
          " km). You cannot enter a lower value."
      );
      return;
    }
    if (releaseExceedsLimit && !releaseExceededReason.trim()) {
      setError("You exceeded the company limit (" + defaultKm + " km). Please provide a reason.");
      return;
    }
    setReleaseSubmitting(true);
    setError("");
    try {
      await apiReleaseReservation(releaseModal.id, newKm, releaseExceedsLimit ? releaseExceededReason : undefined);
      setReleaseModal(null);
      load();
    } catch (err) {
      setError(err.message || "Failed to release");
    } finally {
      setReleaseSubmitting(false);
    }
  }

  const userNavGroups = useMemo(
    () => [
      {
        label: t("nav.sections.overview"),
        items: [
          { id: "dashboard", label: t("nav.items.dashboard"), icon: <LayoutGrid className={UICON.s} aria-hidden /> },
          { id: "drivingLicence", label: t("nav.items.drivingLicence"), icon: <IdCard className={UICON.s} aria-hidden /> },
          { id: "security", label: t("nav.items.security"), icon: <Shield className={UICON.s} aria-hidden /> },
        ],
      },
      {
        label: t("nav.sections.fleet"),
        items: [
          { id: "availableCars", label: t("nav.items.availableCars"), icon: <Car className={UICON.s} aria-hidden /> },
          { id: "unavailableCars", label: t("nav.items.unavailableCars"), icon: <Wrench className={UICON.s} aria-hidden /> },
        ],
      },
      {
        label: t("nav.sections.myActivity"),
        items: [
          { id: "myReservations", label: t("nav.items.myReservations"), icon: <Calendar className={UICON.s} aria-hidden /> },
          { id: "bookingCalendar", label: t("nav.items.bookingCalendar"), icon: <CalendarDays className={UICON.s} aria-hidden /> },
          { id: "history", label: t("nav.items.history"), icon: <History className={UICON.s} aria-hidden /> },
          { id: "glovebox", label: t("nav.items.glovebox"), icon: <FolderOpen className={UICON.s} aria-hidden /> },
          { id: "incidents", label: "Incidents", icon: <AlertTriangle className={UICON.s} aria-hidden /> },
        ],
      },
    ],
    [t]
  );

  const userMetaKey = USER_PAGE_META_KEYS[section];
  const pageMeta =
    userMetaKey != null
      ? { title: t(`pageMeta.${userMetaKey}.title`), sub: t(`pageMeta.${userMetaKey}.sub`) }
      : { title: t("nav.items.dashboard"), sub: "" };

  return (
    <div className="flex h-full w-full min-h-0" style={{ background: "var(--main-bg)" }}>
      <Sidebar user={user} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} viewAs={viewAs} setViewAs={setViewAs}>
        {userNavGroups.map((group, gi) => (
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
              className="md:hidden p-2 rounded-lg bg-slate-100 text-slate-700 min-h-[44px] min-w-[44px] flex items-center justify-center border border-slate-200/80 hover:bg-slate-200 transition-colors"
              aria-label={t("common.openMenu")}
            >
              ☰
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-medium text-slate-900 truncate">{pageMeta.title}</h1>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{pageMeta.sub}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <LanguageCurrencySwitcher variant="light" />
            {company?.joinCode && (
              <span className="join-badge-pill font-medium hidden sm:inline shrink-0">
                {t("nav.joinCode")} <span className="font-mono">{company.joinCode}</span>
              </span>
            )}
          </div>
        </header>
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-5 sm:p-6 md:px-8 md:pb-8 md:pt-6 flex flex-col">
        {company?.joinCode && (
          <p className="mb-4 text-xs text-slate-500 sm:hidden shrink-0">
            {t("nav.joinCode")} <code className="font-mono text-slate-800 font-semibold">{company.joinCode}</code>
          </p>
        )}
        {error && (
          <div className="mb-6 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100">{error}</div>
        )}

        {section === "dashboard" && (
          <section className="w-full min-w-0">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Dashboard</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
              <div className="bg-white rounded-[12px] shadow-[0_1px_3px_0_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06)] border border-slate-100/80 p-6 flex items-center gap-4">
                <span className="text-3xl w-12 h-12 flex items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]" aria-hidden>🚗</span>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{activeReservations.length}</p>
                  <p className="text-sm text-slate-500">Active Reservations</p>
                </div>
              </div>
              <div className="bg-white rounded-[12px] shadow-[0_1px_3px_0_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06)] border border-slate-100/80 p-6 flex items-center gap-4">
                <span className="text-3xl w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600" aria-hidden>📜</span>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{history.length}</p>
                  <p className="text-sm text-slate-500">Total Reservations</p>
                </div>
              </div>
              <div className="bg-white rounded-[12px] shadow-[0_1px_3px_0_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06)] border border-slate-100/80 p-6 flex items-center gap-4">
                <span className="text-3xl w-12 h-12 flex items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]" aria-hidden>✅</span>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{availableCars.length}</p>
                  <p className="text-sm text-slate-500">Available Cars</p>
                </div>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-3">Recent activity</h3>
            <div className="w-full bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="py-4 px-4 font-semibold text-slate-700">Date</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Car</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {history.slice(0, 10).map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-4">{formatDate(r.startDate)}</td>
                      <td className="py-4 px-4">
                        {r.car?.brand} {r.car?.registrationNumber}
                        {r.car?.vehicleCategory ? ` · ${r.car.vehicleCategory}` : ""}
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${statusClass(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && !loading && (
                    <tr><td colSpan={3} className="py-10 px-4 text-center text-slate-500">No activity yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {section === "drivingLicence" && (
          <section className="w-full min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-4 sm:mb-6">Driving licence</h2>
            <p className="text-sm text-slate-500 mb-4">
              Choose a photo, then click <strong>Save</strong> to upload. The system sends it to the AI validator automatically. If the AI is unavailable, an admin can still approve you.
            </p>
            <div className="bg-white rounded-[12px] shadow-[0_1px_3px_0_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06)] border border-slate-100/80 p-4 sm:p-6 max-w-lg">
              <div className="mb-4">
                <span className="text-sm font-semibold text-slate-600">Status: </span>
                <span className={`px-2 py-0.5 rounded-lg text-sm font-medium ${
                  dlStatus === "APPROVED" ? "bg-emerald-100 text-emerald-800" :
                  dlStatus === "PENDING" ? "bg-amber-100 text-amber-800" :
                  dlStatus === "REJECTED" ? "bg-red-100 text-red-800" :
                  "bg-slate-100 text-slate-800"
                }`}>
                  {dlStatus === "APPROVED" ? "Approved" : dlStatus === "PENDING" ? "Pending approval" : dlStatus === "REJECTED" ? "Rejected" : "Not uploaded"}
                </span>
              </div>
              {user?.drivingLicenceUrl && (
                <div className="mb-4">
                  <p className="text-sm text-slate-500 mb-2">Uploaded photo:</p>
                  <a href={user.drivingLicenceUrl} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden border border-slate-200 max-w-xs">
                    <img src={user.drivingLicenceUrl} alt="Driving licence" className="w-full h-auto max-h-48 object-contain bg-slate-50" />
                  </a>
                </div>
              )}
              <label className="block">
                <span className="sr-only">Choose image</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleDlFileSelect}
                  disabled={dlUploading || dlDeleting}
                  className="block w-full text-sm text-slate-800 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-slate-200 file:text-slate-800 file:font-semibold file:cursor-pointer file:shadow-sm"
                />
              </label>
              {selectedDlFile && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-slate-700 mb-1">New file: {selectedDlFile.name}</p>
                  {dlPreviewUrl && (
                    <img src={dlPreviewUrl} alt="Preview" className="rounded-xl border border-slate-200 max-h-32 object-contain bg-slate-50 mb-3" />
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-3 mt-4">
                <button
                  type="button"
                  onClick={handleDlSave}
                  disabled={dlUploading || dlDeleting || !selectedDlFile}
                  className="px-5 py-2.5 rounded-xl font-semibold text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {dlUploading ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={handleDlDelete}
                  disabled={dlUploading || dlDeleting || !user?.drivingLicenceUrl}
                  className="px-5 py-2.5 rounded-xl font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {dlDeleting ? "Deleting…" : "Delete"}
                </button>
              </div>
              {dlUploading && <p className="text-sm text-[#7f8c8d] mt-2">Uploading and running AI check…</p>}
              {dlNotice && (
                <div
                  className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                    dlNotice.type === "success"
                      ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                      : dlNotice.type === "warning"
                      ? "bg-amber-50 text-amber-900 border border-amber-200"
                      : "bg-slate-50 text-slate-800 border border-slate-200"
                  }`}
                >
                  {dlNotice.text}
                </div>
              )}
              {user?.drivingLicenceUrl && identityStatus !== "VERIFIED" && (
                <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
                  <p className="text-sm font-semibold text-sky-900">Mandatory mobile face capture</p>
                  <p className="text-xs text-sky-800 mt-1">
                    After uploading your driving licence, you must complete a mobile selfie check to finish verification.
                  </p>
                  {mobileCaptureSession?.captureUrl ? (
                    <div className="mt-3">
                      <div className="inline-flex items-center justify-center p-2 bg-white rounded-lg border border-sky-200">
                        <QRCodeSVG value={mobileCaptureSession.captureUrl} size={170} includeMargin />
                      </div>
                      <p className="mt-2 text-[11px] text-sky-900 break-all">
                        {mobileCaptureSession.captureUrl}
                      </p>
                      <p className="text-xs text-sky-800 mt-1">
                        Expires: {mobileCaptureSession.expiresAt ? new Date(mobileCaptureSession.expiresAt).toLocaleString() : "soon"}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-sky-800">Generate your secure mobile verification link.</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => createOrEmailMobileLink(false)}
                      disabled={mobileCaptureBusy}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-40"
                    >
                      {mobileCaptureBusy ? "Generating…" : "Generate link / refresh QR"}
                    </button>
                    <button
                      type="button"
                      onClick={() => createOrEmailMobileLink(true)}
                      disabled={mobileCaptureBusy}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-40"
                    >
                      Send to my email
                    </button>
                    {mobileCaptureSession?.captureUrl && (
                      <a
                        href={mobileCaptureSession.captureUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50"
                      >
                        Open on this device
                      </a>
                    )}
                  </div>
                </div>
              )}
              {!canReserve && dlStatus !== "PENDING" && dlStatus !== "REJECTED" && (
                <p className="text-sm text-amber-700 mt-3">Upload your driving licence and wait for admin approval to reserve cars.</p>
              )}
              {dlStatus === "REJECTED" && (
                <p className="text-sm text-red-700 mt-3">Your licence was rejected. You can upload a new photo for review.</p>
              )}
            </div>

            <div className="bg-white rounded-[12px] shadow-[0_1px_3px_0_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06)] border border-slate-100/80 p-4 sm:p-6 max-w-lg mt-4">
              <div className="mb-4">
                <span className="text-sm font-semibold text-slate-600">Identity status: </span>
                <span className={`px-2 py-0.5 rounded-lg text-sm font-medium ${
                  identityStatus === "VERIFIED" ? "bg-emerald-100 text-emerald-800" :
                  identityStatus === "PENDING" ? "bg-amber-100 text-amber-800" :
                  identityStatus === "PENDING_REVIEW" ? "bg-amber-100 text-amber-800" :
                  identityStatus === "REJECTED" ? "bg-red-100 text-red-800" :
                  "bg-slate-100 text-slate-800"
                }`}>
                  {identityStatus === "VERIFIED" ? "Verified" : identityStatus === "PENDING" ? "Pending" : identityStatus === "PENDING_REVIEW" ? "Pending admin review" : identityStatus === "REJECTED" ? "Rejected" : "Not started"}
                </span>
              </div>
              <p className="text-sm text-slate-500 mb-2">
                This step is completed on your phone. Scan the QR code above or use the email link to open the mobile camera page and capture your face photo.
              </p>
              {identityNotice && (
                <div
                  className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                    identityNotice.type === "success"
                      ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                      : "bg-amber-50 text-amber-900 border border-amber-200"
                  }`}
                >
                  {identityNotice.text}
                </div>
              )}
            </div>
          </section>
        )}

        {section === "security" && (
          <section className="w-full min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-4 sm:mb-6">{t("pageMeta.userSecurity.title")}</h2>
            <p className="text-sm text-slate-500 mb-4 max-w-xl">{t("userSecurityForm.intro")}</p>
            <div className="bg-white rounded-[12px] shadow-[0_1px_3px_0_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06)] border border-slate-100/80 p-4 sm:p-6 max-w-lg">
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700">{t("userSecurityForm.statusLabel")}</span>
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    user?.mfaEnabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {user?.mfaEnabled ? t("userSecurityForm.on") : t("userSecurityForm.off")}
                </span>
              </div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">{t("userSecurityForm.passwordLabel")}</label>
              <input
                type="password"
                value={mfaPassword}
                onChange={(e) => setMfaPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 mb-4"
                disabled={mfaSaving}
              />
              <div className="flex flex-wrap gap-3">
                {!user?.mfaEnabled ? (
                  <button
                    type="button"
                    onClick={() => handleMfaToggle(true)}
                    disabled={mfaSaving}
                    className="px-5 py-2.5 rounded-xl font-semibold text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-40 transition-colors shadow-sm"
                  >
                    {mfaSaving ? t("userSecurityForm.saving") : t("userSecurityForm.enableBtn")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleMfaToggle(false)}
                    disabled={mfaSaving}
                    className="px-5 py-2.5 rounded-xl font-semibold text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-40 transition-colors shadow-sm"
                  >
                    {mfaSaving ? t("userSecurityForm.saving") : t("userSecurityForm.disableBtn")}
                  </button>
                )}
              </div>
              {mfaNotice?.type === "success" && (
                <p className="mt-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">{mfaNotice.text}</p>
              )}

              <div className="mt-8 pt-6 border-t border-slate-200">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-slate-300"
                    checked={user?.emailBookingNotifications !== false}
                    disabled={emailNotifSaving}
                    onChange={async (e) => {
                      setEmailNotifSaving(true);
                      setCalendarMsg(null);
                      try {
                        await apiUserEmailNotifications(e.target.checked);
                        await onUserUpdated?.();
                      } catch (err) {
                        setCalendarMsg({ type: "err", text: err.message || "Failed to save" });
                      } finally {
                        setEmailNotifSaving(false);
                      }
                    }}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">{t("userSecurityForm.bookingEmailsLabel")}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">{t("userSecurityForm.bookingEmailsHint")}</span>
                  </span>
                </label>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-200">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-slate-800">{t("userSecurityForm.calendarFeedTitle")}</h3>
                  <span className="relative inline-flex group">
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
                      aria-label={t("userSecurityForm.calendarFeedHelpAria")}
                      aria-describedby="calendar-feed-google-help"
                    >
                      <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </button>
                    <div
                      id="calendar-feed-google-help"
                      role="tooltip"
                      className="pointer-events-none invisible absolute z-[60] bottom-full left-0 mb-2 w-[min(calc(100vw-2rem),18rem)] rounded-lg border border-slate-200 bg-white p-3 text-left text-xs leading-relaxed text-slate-700 shadow-lg opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 sm:left-1/2 sm:w-80 sm:-translate-x-1/2"
                    >
                      <p className="mb-2 font-semibold text-slate-900">{t("userSecurityForm.calendarFeedGoogleTitle")}</p>
                      <ol className="list-decimal space-y-1.5 pl-4 marker:text-slate-500">
                        <li>{t("userSecurityForm.calendarFeedGoogleStep1")}</li>
                        <li>{t("userSecurityForm.calendarFeedGoogleStep2")}</li>
                        <li>{t("userSecurityForm.calendarFeedGoogleStep3")}</li>
                        <li>{t("userSecurityForm.calendarFeedGoogleStep4")}</li>
                        <li className="text-slate-600">{t("userSecurityForm.calendarFeedGoogleStep5")}</li>
                      </ol>
                    </div>
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-3">{t("userSecurityForm.calendarFeedIntro")}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={calendarLoading}
                    onClick={async () => {
                      setCalendarLoading(true);
                      setCalendarMsg(null);
                      try {
                        const d = await apiUserCalendarFeedUrl();
                        setCalendarUrl(d.feedUrl || "");
                      } catch (err) {
                        setCalendarMsg({ type: "err", text: err.message || "Failed" });
                      } finally {
                        setCalendarLoading(false);
                      }
                    }}
                    className="px-4 py-2 text-sm font-semibold rounded-xl bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200/80 disabled:opacity-50"
                  >
                    {calendarLoading ? "…" : t("userSecurityForm.calendarFeedShow")}
                  </button>
                  {calendarUrl && (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(calendarUrl);
                            setCalendarMsg({ type: "ok", text: t("userSecurityForm.calendarFeedCopied") });
                          } catch {
                            setCalendarMsg({ type: "err", text: "Copy failed" });
                          }
                        }}
                        className="px-4 py-2 text-sm font-semibold rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
                      >
                        {t("userSecurityForm.calendarFeedCopy")}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setCalendarLoading(true);
                          setCalendarMsg(null);
                          try {
                            const d = await apiUserCalendarFeedRotate();
                            setCalendarUrl(d.feedUrl || "");
                            await onUserUpdated?.();
                          } catch (err) {
                            setCalendarMsg({ type: "err", text: err.message || "Failed" });
                          } finally {
                            setCalendarLoading(false);
                          }
                        }}
                        className="px-4 py-2 text-sm font-semibold rounded-xl border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                      >
                        {t("userSecurityForm.calendarFeedRotate")}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm("Disable calendar subscription? Apps using the old link will stop updating.")) return;
                          setCalendarLoading(true);
                          setCalendarMsg(null);
                          try {
                            await apiUserCalendarFeedDisable();
                            setCalendarUrl("");
                            await onUserUpdated?.();
                          } catch (err) {
                            setCalendarMsg({ type: "err", text: err.message || "Failed" });
                          } finally {
                            setCalendarLoading(false);
                          }
                        }}
                        className="px-4 py-2 text-sm font-semibold rounded-xl border border-red-200 text-red-700 hover:bg-red-50"
                      >
                        {t("userSecurityForm.calendarFeedDisable")}
                      </button>
                    </>
                  )}
                </div>
                {calendarUrl && (
                  <p className="mt-3 text-xs text-slate-600 break-all font-mono bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">{calendarUrl}</p>
                )}
                {calendarMsg?.type === "ok" && (
                  <p className="mt-2 text-sm text-emerald-700">{calendarMsg.text}</p>
                )}
                {calendarMsg?.type === "err" && (
                  <p className="mt-2 text-sm text-red-600">{calendarMsg.text}</p>
                )}
              </div>
            </div>
          </section>
        )}

        {section === "bookingCalendar" && (
          <section className="w-full min-w-0 flex flex-col flex-1 min-h-0">
            <div className="shrink-0">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-2">Booking calendar</h2>
              <p className="text-sm text-slate-600 mb-4 max-w-2xl">
                Your reservations only. For fleet-wide availability (all cars), an admin can open <strong>Fleet calendar</strong> in the admin area.
              </p>
            </div>
            {loading ? (
              <p className="text-slate-500 shrink-0">Loading…</p>
            ) : (
              <FleetBookingCalendar
                reservations={reservations}
                cars={cars}
                variant="personal"
                currentUserId={user?.id}
                className="flex-1 min-h-0"
              />
            )}
          </section>
        )}

        {section === "myReservations" && (
          <section className="w-full min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-4 sm:mb-6">My Reservations</h2>
            <div className="w-full bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden overflow-x-auto">
              <table className="w-full min-w-[280px]">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="py-4 px-4 font-semibold text-slate-700">Car</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Reserved at</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Status</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {reservations.map((r) => (
                    <Fragment key={r.id}>
                      <tr className="border-t border-slate-100 hover:bg-slate-50/80 transition-colors">
                        <td className="py-4 px-4">
                          {r.car?.brand} {r.car?.registrationNumber}
                          {r.car?.vehicleCategory ? ` · ${r.car.vehicleCategory}` : ""}
                        </td>
                        <td className="py-4 px-4">{formatDate(r.startDate)}</td>
                        <td className="py-4 px-4">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${statusClass(r.status)}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-4 px-4 flex flex-wrap gap-2 items-center">
                          <button
                            type="button"
                            onClick={() => downloadReservationIcs(r.id)}
                            disabled={icsDownloadingId === r.id}
                            className="inline-flex px-3 py-2 min-h-[44px] sm:min-h-0 items-center bg-slate-100 text-slate-800 text-sm font-semibold rounded-xl hover:bg-slate-200 border border-slate-200/80 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                          >
                            {icsDownloadingId === r.id ? "Downloading…" : "Calendar (.ics)"}
                          </button>
                          {(r.status || "").toLowerCase() === "active" && (
                            <>
                              <button
                                type="button"
                                onClick={() => openReleaseModal(r)}
                                className="px-3 py-2 min-h-[44px] sm:min-h-0 bg-[var(--primary)] text-white text-sm font-semibold rounded-xl hover:bg-[var(--primary-hover)] shadow-sm transition-colors"
                              >
                                Release
                              </button>
                              <button
                                type="button"
                                onClick={() => cancelRes(r.id)}
                                className="px-3 py-2 min-h-[44px] sm:min-h-0 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 shadow-sm transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                      {((r.status || "").toLowerCase() === "active") ||
                      (r.pickup_code != null || r.release_code != null) ? (
                        <tr key={`${r.id}-codes`} className="border-t-0 bg-slate-50/60">
                          <td colSpan={4} className="py-4 px-4">
                            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                              <h3 className="text-sm font-semibold text-slate-700 mb-3">Access Codes</h3>
                              <div className="flex flex-wrap gap-4 items-start">
                                {((r.status || "").toLowerCase() === "active" || r.pickup_code != null) && (
                                  <div className="min-w-[160px] rounded-xl border-2 border-[#1E293B]/20 bg-[#1E293B]/5 px-4 py-3 text-center shadow-sm">
                                    <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">Start Rental Code</p>
                                    <p className="text-2xl font-bold tabular-nums tracking-widest text-[#1E293B] min-h-[2.5rem] flex items-center justify-center">
                                      {r.pickup_code != null ? (
                                        r.pickup_code
                                      ) : (
                                        <span className={`${ACCESS_CODE_SLOT_CLASS} border-dashed text-slate-400`}>—</span>
                                      )}
                                    </p>
                                    {r.pickup_code != null && (
                                      <AccessCodeQRButton code={r.pickup_code} label="QR for pickup" className="mt-2" />
                                    )}
                                    {(r.status || "").toLowerCase() === "active" && r.pickup_code != null && (() => {
                                      const pickupStatus = getPickupCodeStatus(r, now);
                                      if (!pickupStatus) return null;
                                      const badgeClass = pickupStatus.status === "pending" ? "bg-slate-100 text-slate-700" : pickupStatus.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800";
                                      return (
                                        <div className="mt-2 flex flex-col gap-1 items-center">
                                          <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${badgeClass}`}>
                                            {pickupStatus.status === "pending" ? "Pending" : pickupStatus.status === "active" ? "Active" : "Expired"}
                                          </span>
                                          <span className="text-xs text-slate-500">{pickupStatus.countdownText}</span>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}
                                {((r.status || "").toLowerCase() === "active" || r.release_code != null) && (
                                  <div className="min-w-[160px] rounded-xl border-2 border-[#1E293B]/20 bg-[#1E293B]/5 px-4 py-3 text-center shadow-sm">
                                    <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">End Rental Code</p>
                                    <p className="text-2xl font-bold tabular-nums tracking-widest text-[#1E293B] min-h-[2.5rem] flex items-center justify-center">
                                      {r.release_code != null ? (
                                        r.release_code
                                      ) : (
                                        <span className={`${ACCESS_CODE_SLOT_CLASS} border-dashed text-slate-400`}>—</span>
                                      )}
                                    </p>
                                    {r.release_code != null && (
                                      <AccessCodeQRButton code={r.release_code} label="QR for return" className="mt-2" />
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                  {reservations.length === 0 && !loading && (
                    <tr><td colSpan={4} className="py-10 px-4 text-center text-slate-500">No reservations</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {section === "availableCars" && (
          <section className="w-full min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-4 sm:mb-6">Available Cars</h2>
            {!canReserve && (
              <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-800 text-sm">
                You need an approved driving licence to reserve a car. Go to <button type="button" onClick={() => setSection("drivingLicence")} className="underline font-semibold">Driving licence</button> to complete this step.
              </div>
            )}
            <div className="w-full bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden overflow-x-auto">
              <table className="w-full min-w-[280px]">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="py-4 px-4 font-semibold text-slate-700">Brand</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Registration</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Km</th>
                    <th className="py-4 px-4 font-semibold text-slate-700 hidden sm:table-cell">Status</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {availableCars.map((c) => (
                    <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-4">{c.brand}</td>
                      <td className="py-4 px-4">{c.registrationNumber}{c.vehicleCategory ? ` · ${c.vehicleCategory}` : ""}</td>
                      <td className="py-4 px-4">{formatNumber(c.km ?? 0, { maximumFractionDigits: 0 })} km</td>
                      <td className="py-4 px-4 hidden sm:table-cell">
                        <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800">Available</span>
                      </td>
                      <td className="py-4 px-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => canReserve && reserveInstant(c.id)}
                          disabled={reservingCarId === c.id || !canReserve}
                          className="px-3 py-2 min-h-[44px] sm:min-h-0 bg-[var(--primary)] text-white text-sm font-semibold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
                        >
                          {reservingCarId === c.id ? "Reserving…" : "Reserve now"}
                        </button>
                        <button
                          type="button"
                          onClick={() => canReserve && openScheduleModal(c)}
                          disabled={!canReserve}
                          className="px-3 py-2 min-h-[44px] sm:min-h-0 bg-[#1E293B] text-white text-sm font-semibold rounded-xl hover:bg-[#334155] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
                        >
                          Schedule
                        </button>
                      </td>
                    </tr>
                  ))}
                  {availableCars.length === 0 && !loading && (
                    <tr><td colSpan={5} className="py-10 px-4 text-center text-slate-500">No available cars</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {section === "unavailableCars" && (
          <section className="w-full min-w-0">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Unavailable Cars</h2>
            <div className="w-full bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="py-4 px-4 font-semibold text-slate-700">Brand</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Registration</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Km</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {unavailableCars.map((c) => (
                    <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-4">{c.brand}</td>
                      <td className="py-4 px-4">{c.registrationNumber}{c.vehicleCategory ? ` · ${c.vehicleCategory}` : ""}</td>
                      <td className="py-4 px-4">{formatNumber(c.km ?? 0, { maximumFractionDigits: 0 })} km</td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${statusClass(c.status)}`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {unavailableCars.length === 0 && !loading && (
                    <tr><td colSpan={4} className="py-10 px-4 text-center text-slate-500">No unavailable cars</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {section === "history" && (
          <section className="w-full min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-4 sm:mb-6">Reservation History</h2>
            {(() => {
              const byYear = {};
              history.forEach((r) => {
                const year = r.startDate ? new Date(r.startDate).getFullYear() : new Date().getFullYear();
                if (!byYear[year]) byYear[year] = { count: 0, km: 0 };
                byYear[year].count += 1;
                if (r.releasedKmUsed != null && r.releasedKmUsed >= 0) byYear[year].km += r.releasedKmUsed;
              });
              const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
              if (years.length === 0) return null;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                  {years.map((year) => (
                    <div key={year} className="bg-white rounded-[12px] shadow-[0_1px_3px_0_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06)] p-4 border border-slate-100/80">
                      <div className="text-sm font-semibold text-slate-500">{year}</div>
                      <div className="mt-1 text-xl font-bold text-slate-800">{byYear[year].count} reservation{byYear[year].count !== 1 ? "s" : ""}</div>
                      <div className="text-sm text-[var(--primary)] font-medium">{formatNumber(byYear[year].km, { maximumFractionDigits: 0 })} km total</div>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div className="w-full bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden overflow-x-auto">
              <table className="w-full min-w-[320px]">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="py-4 px-4 font-semibold text-slate-700">Reserved at</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Car</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Purpose</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Status</th>
                    <th className="py-4 px-4 font-semibold text-slate-700 min-w-[10rem]">Start / end code</th>
                    <th className="py-4 px-4 font-semibold text-slate-700">Admin note</th>
                    <th className="py-4 px-4 font-semibold text-slate-700 whitespace-nowrap">Journey sheet</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {history.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-4">{formatDate(r.startDate)}</td>
                      <td className="py-4 px-4">
                        {r.car?.brand} {r.car?.registrationNumber}
                        {r.car?.vehicleCategory ? ` · ${r.car.vehicleCategory}` : ""}
                      </td>
                      <td className="py-4 px-4">{r.purpose || "—"}</td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${statusClass(r.status)}`}>
                          {r.status}
                        </span>
                        {r.releasedKmUsed != null && (
                          <span className="block text-xs text-slate-500 mt-1">{r.releasedKmUsed} km</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <span className={ACCESS_CODE_SLOT_CLASS} title="Start (pickup) code">
                            {r.pickup_code != null ? r.pickup_code : <span className="text-slate-400">—</span>}
                          </span>
                          <span className="text-slate-300">/</span>
                          <span className={ACCESS_CODE_SLOT_CLASS} title="End (return) code">
                            {r.release_code != null ? r.release_code : <span className="text-slate-400">—</span>}
                          </span>
                        </span>
                      </td>
                      <td className="py-4 px-4 text-sm">
                        {r.releasedExceededAdminComment ? (
                          <span className="text-slate-800">{r.releasedExceededAdminComment}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {(r.status || "").toLowerCase() === "completed" ? (
                          <button
                            type="button"
                            disabled={journeyPdfLoadingId === r.id}
                            onClick={async () => {
                              setJourneyPdfLoadingId(r.id);
                              setError("");
                              try {
                                await downloadJourneySheetPdf(r.id);
                              } catch (e) {
                                setError(e?.message || "Could not download PDF");
                              } finally {
                                setJourneyPdfLoadingId(null);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50"
                          >
                            <FileDown className="w-3.5 h-3.5" aria-hidden />
                            {journeyPdfLoadingId === r.id ? "…" : "PDF"}
                          </button>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && !loading && (
                    <tr><td colSpan={7} className="py-10 px-4 text-center text-slate-500">No history</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {section === "glovebox" && (
          <section className="w-full min-w-0 space-y-4 max-w-2xl">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800">{t("nav.items.glovebox")}</h2>
            <p className="text-sm text-slate-500">
              With an active booking, open your RCA file (PDF or image) in full screen from here, and check ITP / RCA / vignette dates for roadside use.
            </p>
            {gloveboxLoading ? (
              <p className="text-sm text-slate-500">{t("common.loading")}</p>
            ) : !glovebox?.active ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm p-4">
                You do not have an active reservation. Reserve a vehicle to see documents for that car here.
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-6 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Current vehicle</p>
                  <p className="text-lg font-bold text-slate-900">{glovebox.car?.label || "—"}</p>
                </div>
                <ul className="text-sm text-slate-700 space-y-1">
                  <li>
                    <span className="text-slate-500">ITP: </span>
                    {formatDateOnly(glovebox.car?.itpExpiresAt)}
                  </li>
                  <li>
                    <span className="text-slate-500">RCA: </span>
                    {formatDateOnly(glovebox.car?.rcaExpiresAt)}
                  </li>
                  <li>
                    <span className="text-slate-500">Rovinieta: </span>
                    {formatDateOnly(glovebox.car?.vignetteExpiresAt)}
                  </li>
                </ul>
                {glovebox.car?.rcaDocumentUrl ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2">RCA Document</p>
                    <Link
                      href="/glovebox/rca"
                      className="inline-flex items-center justify-center gap-2 w-full max-w-sm px-4 py-3 rounded-xl text-sm font-semibold text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)] shadow-sm"
                    >
                      <FileText className="w-4 h-4 shrink-0" aria-hidden />
                      View RCA Document
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No RCA document uploaded for this vehicle.</p>
                )}
                {glovebox.car?.vignetteDocumentUrl ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2">Rovinietă / vignette</p>
                    <Link
                      href="/glovebox/vignette"
                      className="inline-flex items-center justify-center gap-2 w-full max-w-sm px-4 py-3 rounded-xl text-sm font-semibold text-white bg-[#1E293B] hover:bg-[#334155] shadow-sm"
                    >
                      <FileText className="w-4 h-4 shrink-0" aria-hidden />
                      View vignette document
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No vignette document uploaded for this vehicle.</p>
                )}
                {glovebox.brokerRenewalUrl ? (
                  <a
                    href={glovebox.brokerRenewalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex text-sm font-semibold text-sky-700 hover:underline"
                  >
                    Insurance renewal offers (broker) →
                  </a>
                ) : null}
              </div>
            )}
          </section>
        )}

        {section === "incidents" && (
          <section className="w-full min-w-0 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-6 max-w-3xl overflow-hidden">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-2">I had an incident</h2>
              <p className="text-sm text-slate-500 mb-4">
                Step-by-step: add photos in the suggested order, then details. Admins are notified automatically. For a road collision, complete an amicable finding (constatare amiabilă) with the other driver when safe to do so, or follow police instructions.
              </p>
              <div className="flex flex-wrap gap-2 mb-6">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold ${
                      incidentStep === i ? "bg-[var(--primary)] text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {i + 1}
                  </span>
                ))}
              </div>

              {incidentStep === 0 && (
                <div className="flex flex-col gap-3">
                  <label className="block text-xs font-medium text-slate-600">
                    Vehicle
                    <select
                      value={incidentCarId}
                      onChange={(e) => setIncidentCarId(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
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
                    Severity
                    <select
                      value={incidentSeverity}
                      onChange={(e) => setIncidentSeverity(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                    >
                      <option value="A">A — Critical / High (car becomes unavailable)</option>
                      <option value="B">B — Medium</option>
                      <option value="C">C — Low / cosmetic</option>
                    </select>
                  </label>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (!incidentCarId) {
                          setError("Select the vehicle involved.");
                          return;
                        }
                        setError("");
                        setIncidentStep(1);
                      }}
                      className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)]"
                    >
                      Next <ChevronRight className="w-4 h-4" aria-hidden />
                    </button>
                  </div>
                </div>
              )}

              {incidentStep === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-700">
                    Add photos when it is safe. None are required, but scene + plates help a lot.
                  </p>
                  {[
                    ["Scene / context", incidentSceneFiles, setIncidentSceneFiles, "image/*", false],
                    ["Your vehicle damage", incidentOwnFiles, setIncidentOwnFiles, "image/*", false],
                    ["Other vehicle (if any)", incidentOtherFiles, setIncidentOtherFiles, "image/*", false],
                    ["Licence plates", incidentPlateFiles, setIncidentPlateFiles, "image/*", false],
                    ["Documents (PDF / DOC / DOCX)", incidentDocFiles, setIncidentDocFiles, ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document", true],
                  ].map(([label, files, setFiles, accept, isDoc]) => (
                    <div key={label} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-700 mb-2">{label}</p>
                      <label className="inline-flex items-center gap-2 text-xs text-sky-700 font-medium cursor-pointer">
                        <input
                          type="file"
                          multiple
                          accept={accept}
                          className="hidden"
                          onChange={(e) => {
                            const picked = Array.from(e.target.files || []);
                            e.target.value = "";
                            if (picked.length) setFiles((prev) => [...prev, ...picked]);
                          }}
                        />
                        {isDoc ? "+ Add documents" : "+ Add photos"}
                      </label>
                      {files.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {files.map((f, idx) => (
                            <li key={`${label}_${f.name}_${idx}`} className="flex justify-between gap-2 text-xs text-slate-600">
                              <span className="truncate">{f.name}</span>
                              <button
                                type="button"
                                className="shrink-0 text-red-600 font-medium"
                                onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between">
                    <button
                      type="button"
                      onClick={() => setIncidentStep(0)}
                      className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-800"
                    >
                      <ChevronLeft className="w-4 h-4" aria-hidden /> Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setIncidentStep(2)}
                      className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)]"
                    >
                      Next <ChevronRight className="w-4 h-4" aria-hidden />
                    </button>
                  </div>
                </div>
              )}

              {incidentStep === 2 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="col-span-full block text-xs font-medium text-slate-600">
                    When (optional)
                    <input
                      type="datetime-local"
                      value={incidentOccurredAt}
                      onChange={(e) => setIncidentOccurredAt(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                  </label>
                  <label className="col-span-full block text-xs font-medium text-slate-600">
                    Location (optional)
                    <input
                      type="text"
                      value={incidentLocation}
                      onChange={(e) => setIncidentLocation(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                      placeholder="Address, landmark, parking…"
                    />
                  </label>
                  <div className="col-span-full flex justify-between">
                    <button
                      type="button"
                      onClick={() => setIncidentStep(1)}
                      className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-800"
                    >
                      <ChevronLeft className="w-4 h-4" aria-hidden /> Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setIncidentStep(3)}
                      className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)]"
                    >
                      Next <ChevronRight className="w-4 h-4" aria-hidden />
                    </button>
                  </div>
                </div>
              )}

              {incidentStep === 3 && (
                <div className="flex flex-col gap-3">
                  <label className="block text-xs font-medium text-slate-600">
                    Short title
                    <input
                      type="text"
                      value={incidentTitle}
                      onChange={(e) => setIncidentTitle(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                      placeholder="e.g. Rear bumper scratch in parking"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    What happened? (optional)
                    <textarea
                      value={incidentDescription}
                      onChange={(e) => setIncidentDescription(e.target.value)}
                      rows={4}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                      placeholder="Other party, injuries, police, towing…"
                    />
                  </label>
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 break-words">
                    <strong className="text-slate-800">Amicable finding:</strong> in Romania, minor crashes are often documented with a constatare amiabila agreed with the other driver. If anyone is hurt, traffic is blocked, or you are unsure, call emergency services and follow their instructions.
                  </div>
                  <div className="flex justify-between flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setIncidentStep(2)}
                      className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-800"
                    >
                      <ChevronLeft className="w-4 h-4" aria-hidden /> Back
                    </button>
                    <button
                      type="button"
                      disabled={incidentSubmitting}
                      onClick={async () => {
                        if (!incidentCarId || !incidentTitle.trim()) {
                          setError("Select a vehicle and enter a short title.");
                          return;
                        }
                        setIncidentSubmitting(true);
                        setError("");
                        try {
                          const form = new FormData();
                          form.append("carId", incidentCarId);
                          if (incidentOccurredAt) form.append("occurredAt", new Date(incidentOccurredAt).toISOString());
                          form.append("severity", incidentSeverity);
                          form.append("title", incidentTitle.trim());
                          if (incidentLocation.trim()) form.append("location", incidentLocation.trim());
                          if (incidentDescription.trim()) form.append("description", incidentDescription.trim());
                          for (const f of incidentSceneFiles) form.append("file_scene", f);
                          for (const f of incidentOwnFiles) form.append("file_own", f);
                          for (const f of incidentOtherFiles) form.append("file_other", f);
                          for (const f of incidentPlateFiles) form.append("file_plate", f);
                          for (const f of incidentDocFiles) form.append("files", f);
                          await apiIncidentCreate(form);
                          setIncidentStep(0);
                          setIncidentTitle("");
                          setIncidentSeverity("C");
                          setIncidentLocation("");
                          setIncidentDescription("");
                          setIncidentOccurredAt("");
                          setIncidentSceneFiles([]);
                          setIncidentOwnFiles([]);
                          setIncidentOtherFiles([]);
                          setIncidentPlateFiles([]);
                          setIncidentDocFiles([]);
                          await loadIncidents();
                        } catch (err) {
                          setError(err.message || "Failed to submit incident");
                        } finally {
                          setIncidentSubmitting(false);
                        }
                      }}
                      className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50"
                    >
                      {incidentSubmitting ? "Submitting…" : "Submit report"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">My incident reports</h3>
              {incidentLoading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : incidents.length === 0 ? (
                <p className="text-sm text-slate-500">No incidents reported yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px]">
                    <thead>
                      <tr className="text-left text-xs text-slate-500">
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 pr-3">Car</th>
                        <th className="py-2 pr-3">Title</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Attachments</th>
                        <th className="py-2 pr-3">Add more</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm text-slate-800">
                      {incidents.map((r) => (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="py-3 pr-3 whitespace-nowrap">{formatDate(r.occurredAt || r.createdAt)}</td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            {[r.car?.brand, r.car?.registrationNumber, r.car?.vehicleCategory ? `(${r.car.vehicleCategory})` : null].filter(Boolean).join(" ")}
                          </td>
                          <td className="py-3 pr-3">{r.title}</td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-800">
                              {r.status || "SUBMITTED"}
                            </span>
                          </td>
                          <td className="py-3 pr-3">
                            {(r.attachments || []).length ? (
                              <div className="flex flex-col gap-1">
                                {r.attachments.map((a) => (
                                  <a
                                    key={a.id}
                                    href={a.url}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="text-xs text-sky-700 hover:underline"
                                  >
                                    {a.filename}
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="file"
                                multiple
                                className="hidden"
                                accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.doc,.docx"
                                onChange={async (e) => {
                                  const files = Array.from(e.target.files || []);
                                  // allow re-selecting same file later
                                  e.target.value = "";
                                  if (!files.length) return;
                                  setError("");
                                  try {
                                    await apiIncidentAddAttachments(r.id, files);
                                    await loadIncidents();
                                  } catch (err) {
                                    setError(err.message || "Failed to upload attachments");
                                  }
                                }}
                              />
                              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 cursor-pointer">
                                Upload files
                              </span>
                            </label>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {loading && section === "dashboard" && <p className="text-slate-500">Loading…</p>}
        </main>
      </div>

      {/* Schedule booking – start/end date-time */}
      {scheduleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-slate-100">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Book in advance</h3>
            <p className="text-sm text-slate-500 mb-4">{scheduleModal.brand} {scheduleModal.registrationNumber}</p>
            <form onSubmit={submitSchedule} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Start date & time</label>
                <input
                  type="datetime-local"
                  value={scheduleStart}
                  onChange={(e) => setScheduleStart(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 bg-white focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">End date & time</label>
                <input
                  type="datetime-local"
                  value={scheduleEnd}
                  onChange={(e) => setScheduleEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 bg-white focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Purpose (optional)</label>
                <input
                  type="text"
                  value={schedulePurpose}
                  onChange={(e) => setSchedulePurpose(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 bg-white focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                  placeholder="e.g. Client visit"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setScheduleModal(null)} className="px-4 py-2 bg-slate-100 text-slate-800 font-semibold rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
                <button type="submit" disabled={scheduleSubmitting} className="px-4 py-2 bg-[#1E293B] text-white font-semibold rounded-xl hover:bg-[#334155] disabled:opacity-50 shadow-sm transition-colors">{scheduleSubmitting ? "Booking…" : "Book"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Release car – new km (odometer) + reason if exceeded */}
      {releaseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 border border-slate-100">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Release car</h3>
            <p className="text-sm text-slate-500 mb-4">
              {releaseModal.car?.brand} {releaseModal.car?.registrationNumber}
              {releaseCurrentKm != null && (
                <span className="block mt-1">Last known odometer (cannot go below this): {releaseCurrentKm} km</span>
              )}
            </p>
            <form onSubmit={submitRelease} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Current odometer (must be ≥ {releaseCurrentKm} km)</label>
                <input
                  type="number"
                  min={releaseCurrentKm}
                  step={1}
                  value={releaseNewKm}
                  onChange={(e) => setReleaseNewKm(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 bg-white focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                  placeholder={String(releaseCurrentKm)}
                  required
                />
                {releaseKmUsed != null && releaseKmUsed >= 0 && (
                  <p className="text-xs text-slate-500 mt-1">Km used: {releaseKmUsed} km {defaultKm != null && releaseKmUsed > defaultKm && "(exceeds company limit of " + defaultKm + " km)"}</p>
                )}
              </div>
              {releaseExceedsLimit && (
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">Reason for exceeding company limit (required)</label>
                  <textarea
                    value={releaseExceededReason}
                    onChange={(e) => setReleaseExceededReason(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 bg-white focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                    placeholder="Why did you exceed the allowed km?"
                    rows={3}
                    required
                  />
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setReleaseModal(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-800 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={releaseSubmitting}
                  className="px-4 py-2 bg-[var(--primary)] text-white font-semibold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-sm transition-colors"
                >
                  {releaseSubmitting ? "Releasing…" : "Release"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
