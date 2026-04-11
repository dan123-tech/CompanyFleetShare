"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiLogout, clearWebTabSessionId, WEB_SESSION_LOST_EVENT } from "@/lib/api";

const DEFAULT_IDLE_MIN = 30;

function idleMsFromEnv() {
  const raw =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_WEB_IDLE_LOGOUT_MINUTES != null
      ? String(process.env.NEXT_PUBLIC_WEB_IDLE_LOGOUT_MINUTES).trim()
      : "";
  const m = parseInt(raw || String(DEFAULT_IDLE_MIN), 10);
  const minutes = Number.isFinite(m) && m > 0 ? m : DEFAULT_IDLE_MIN;
  return minutes * 60 * 1000;
}

/**
 * Signs the user out after a period with no pointer/keyboard/scroll activity (web dashboard only).
 */
export default function WebIdleLogout() {
  const router = useRouter();
  const pathname = usePathname() || "";
  const lastActivity = useRef(Date.now());
  const fired = useRef(false);
  const idleMs = useRef(idleMsFromEnv());

  const bump = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  useEffect(() => {
    if (!pathname.startsWith("/dashboard")) return undefined;
    fired.current = false;
    idleMs.current = idleMsFromEnv();
    bump();

    const opts = { passive: true };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"];
    for (const ev of events) {
      window.addEventListener(ev, bump, opts);
    }

    const tick = setInterval(() => {
      if (fired.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (Date.now() - lastActivity.current < idleMs.current) return;
      fired.current = true;
      apiLogout().catch(() => {});
      clearWebTabSessionId();
      try {
        window.dispatchEvent(new CustomEvent(WEB_SESSION_LOST_EVENT));
      } catch (_) {}
      router.replace("/login?reason=idle");
    }, 15_000);

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, bump);
      }
      clearInterval(tick);
    };
  }, [pathname, bump, router]);

  return null;
}
