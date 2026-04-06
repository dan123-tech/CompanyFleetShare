"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { apiSession, apiReservations } from "@/lib/api";
import { Bell } from "lucide-react";

const POLL_MS = 45_000;
/** Toast when the booking is within this many minutes of starting (once per reservation). */
const REMINDER_MINUTES_BEFORE_START = 15;
/** After start, show pickup code once within this window (first poll that sees it). */
const START_CODE_NOTIFY_WINDOW_MS = 12 * 60 * 1000;

/**
 * Polls session + reservations; shows in-app toasts and optional browser notifications.
 */
export default function InAppNotificationPoller({ userId, initialLicenceStatus }) {
  const prevDlRef = useRef(initialLicenceStatus ?? null);
  const shownReminderKeys = useRef(new Set());
  const [toasts, setToasts] = useState([]);
  const [notifSupported, setNotifSupported] = useState(false);

  const pushToast = useCallback((title, body) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((t) => [...t.slice(-5), { id, title, body }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 10000);
  }, []);

  const tryBrowserNotify = useCallback(
    (title, body) => {
      if (typeof window === "undefined" || typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;
      try {
        new Notification(title, { body, tag: "fleetadmin-alert" });
      } catch {
        /* ignore */
      }
    },
    [],
  );

  useEffect(() => {
    setNotifSupported(typeof window !== "undefined" && typeof Notification !== "undefined");
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function tick() {
      try {
        const session = await apiSession();
        if (!session?.user || cancelled) return;
        const u = session.user;

        const prev = prevDlRef.current;
        const next = u.drivingLicenceStatus ?? null;
        if (prev === "PENDING" && next === "APPROVED") {
          pushToast("Licence approved", "You can reserve company cars now.");
          tryBrowserNotify("FleetShare", "Your driving licence was approved.");
        }
        if (prev === "PENDING" && next === "REJECTED") {
          pushToast("Licence update", "Your driving licence was rejected. You can upload a new photo.");
          tryBrowserNotify("FleetShare", "Driving licence status: rejected.");
        }
        prevDlRef.current = next;

        const res = await apiReservations({ mine: true });
        if (!Array.isArray(res) || cancelled) return;
        const now = Date.now();
        const selfId = u.id;
        for (const r of res) {
          if (selfId && r.userId && r.userId !== selfId) continue;
          if ((r.status || "").toLowerCase() !== "active") continue;
          if (!r.startDate) continue;
          const startMs = new Date(r.startDate).getTime();
          const msUntil = startMs - now;
          const minUntil = msUntil / 60000;
          if (minUntil > 0 && minUntil <= REMINDER_MINUTES_BEFORE_START) {
            const bucket = Math.floor(startMs / (10 * 60 * 1000));
            const key = `booking-soon-${r.id}-${bucket}`;
            if (!shownReminderKeys.current.has(key)) {
              shownReminderKeys.current.add(key);
              const car = r.car ? [r.car.brand, r.car.registrationNumber].filter(Boolean).join(" ") : "your booking";
              const mins = Math.max(1, Math.round(minUntil));
              pushToast("Booking starts soon", `“${car}” starts in about ${mins} minute${mins === 1 ? "" : "s"}.`);
              tryBrowserNotify("Booking soon", `${car} — about ${mins} min`);
            }
          }
          const msAfterStart = now - startMs;
          if (msAfterStart >= 0 && msAfterStart <= START_CODE_NOTIFY_WINDOW_MS && r.pickup_code) {
            const keyStart = `booking-start-code-${r.id}`;
            if (!shownReminderKeys.current.has(keyStart)) {
              shownReminderKeys.current.add(keyStart);
              const car = r.car ? [r.car.brand, r.car.registrationNumber].filter(Boolean).join(" ") : "your booking";
              const code = String(r.pickup_code).trim();
              pushToast("Booking started", `“${car}” — pickup code: ${code}`);
              tryBrowserNotify("Pickup code", `${car}: ${code}`);
            }
          }
        }
      } catch {
        /* offline / 401 — ignore */
      }
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [userId, pushToast, tryBrowserNotify]);

  async function requestBrowserPermission() {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    if (p === "granted") {
      pushToast("Browser alerts on", "You will get system notifications for reminders when this tab may be in background.");
    }
  }

  if (!userId) return null;

  return (
    <>
      {notifSupported && Notification.permission === "default" && (
        <div className="fixed bottom-4 left-4 z-[100] max-w-xs">
          <button
            type="button"
            onClick={requestBrowserPermission}
            className="flex items-center gap-2 rounded-xl bg-slate-800 text-white text-xs font-semibold px-3 py-2 shadow-lg border border-slate-600 hover:bg-slate-700 transition-colors"
          >
            <Bell className="w-4 h-4 shrink-0" aria-hidden />
            Enable browser notifications
          </button>
        </div>
      )}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto rounded-xl bg-slate-900 text-white px-4 py-3 shadow-lg border border-slate-600"
          >
            <p className="font-semibold text-sm">{t.title}</p>
            <p className="text-xs text-slate-300 mt-1 leading-snug">{t.body}</p>
          </div>
        ))}
      </div>
    </>
  );
}
