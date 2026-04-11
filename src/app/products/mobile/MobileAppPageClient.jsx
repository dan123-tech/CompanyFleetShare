"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  Smartphone, Zap, Bell, BookOpen, ClipboardList, BarChart2,
  Calendar, MapPin, TrendingUp, Shield, Download, CheckCircle,
  ArrowRight, Car, FileText, Users,
} from "lucide-react";
import LandingSiteHeader from "@/components/landing/LandingSiteHeader";
import LandingSiteFooter from "@/components/landing/LandingSiteFooter";
import { LANDING_COL } from "@/components/landing/landingTheme";
import { useI18n } from "@/i18n/I18nProvider";

const COL = LANDING_COL;

/** Same-site default or full URL via NEXT_PUBLIC_ANDROID_DOWNLOAD_URL */
function getAndroidApkHref() {
  const u = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ANDROID_DOWNLOAD_URL?.trim() : "";
  return u || "/downloads/fleetshare.apk";
}

function ApkDownloadAnchor({ className, children }) {
  const href = useMemo(() => getAndroidApkHref(), []);
  const absolute = /^https?:\/\//i.test(href);
  return (
    <a
      href={href}
      className={className}
      {...(absolute
        ? { target: "_blank", rel: "noopener noreferrer" }
        : { download: "fleetshare.apk" })}
    >
      {children}
    </a>
  );
}

function Badge({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-widest"
      style={{ background: "rgba(24,95,165,0.2)", border: "1px solid rgba(24,95,165,0.4)", color: "#93c5fd" }}>
      <span className="w-1.5 h-1.5 rounded-full bg-[#86efac] shrink-0" />
      {children}
    </span>
  );
}

function FeatureCard({ icon: Icon, title, desc }) {
  return (
    <div className="group p-5 rounded-2xl border flex flex-col gap-3 transition-all hover:border-white/20"
      style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "rgba(134,239,172,0.12)", border: "1px solid rgba(134,239,172,0.25)" }}>
        <Icon className="w-5 h-5" style={{ color: "#86efac" }} strokeWidth={1.7} />
      </div>
      <div>
        <h3 className="font-semibold text-white text-[14px] mb-1 leading-snug">{title}</h3>
        <p className="text-[12.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.48)" }}>{desc}</p>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: Car,
    title: "Complete Fleet Management",
    desc: "Add, edit and manage vehicles with all details — brand, model, registration, fuel type, odometer and status. Everything from your Android phone.",
  },
  {
    icon: Zap,
    title: "Instant Reserve Now",
    desc: "Tap once to take a car immediately. The timer starts at tap and stops when you press Release. Exact pickup and release times appear in the journey sheet.",
  },
  {
    icon: Calendar,
    title: "Scheduled Reservations",
    desc: "Book a car days in advance. Get a unique pickup code valid 30 minutes around your start time, and a release code to return the vehicle.",
  },
  {
    icon: Bell,
    title: "Push Notification Reminders",
    desc: "Automatic alarms 30 minutes before every reservation start. Never forget a booking or leave a car unreturned.",
  },
  {
    icon: BookOpen,
    title: "Digital Glovebox",
    desc: "ITP, RCA and vignette expiry dates always visible. View and download the RCA insurance document PDF directly from the app.",
  },
  {
    icon: ClipboardList,
    title: "Incident Reporting",
    desc: "Report accidents and incidents on-site with title, location, severity level and description. Attach photos, PDFs and Word documents from the file picker.",
  },
  {
    icon: FileText,
    title: "Journey Sheet Download",
    desc: "Download legal journey sheet PDFs for any completed trip. Branded documents with actual timestamps, driver info and odometer readings.",
  },
  {
    icon: BarChart2,
    title: "Reports & Export",
    desc: "Generate fleet reports for any single vehicle, period or the entire fleet. Download branded PDFs in a single tap.",
  },
  {
    icon: TrendingUp,
    title: "Statistics Dashboard",
    desc: "Key KPIs at a glance: active reservations, km driven, estimated fuel cost and CO₂ for the last 7 days, 30 days, 6 months or 1 year.",
  },
  {
    icon: Calendar,
    title: "Booking Calendar",
    desc: "Visual calendar showing the full reservation schedule. Filter by car to see what's booked, in-progress or completed across the fleet.",
  },
  {
    icon: MapPin,
    title: "Maintenance Tracker",
    desc: "Log service events with odometer reading, cost and notes. See at a glance which vehicles are due for the next service.",
  },
  {
    icon: Users,
    title: "User & Role Management",
    desc: "Admins can invite users, approve driving licences, change roles and remove members — all from the Android app.",
  },
  {
    icon: Shield,
    title: "Secure Authentication",
    desc: "Session-based login with encrypted tokens. Admin actions are separated from driver actions by role-based access control.",
  },
  {
    icon: Download,
    title: "APK Direct Download",
    desc: "Install the app directly from your FleetShare portal — no Play Store listing required. Always up to date with your deployment.",
  },
];

export default function MobileAppPageClient() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: COL.base }}>
      <LandingSiteHeader />

      <main className="flex-1 w-full">

        {/* ── HERO ── */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-[320px] rounded-full opacity-20"
              style={{ background: "radial-gradient(ellipse, #185fa5 0%, transparent 70%)" }} />
          </div>
          <div className="relative max-w-4xl mx-auto px-5 pt-14 pb-16 text-center">
            <Badge>Android Application</Badge>
            <h1 className="mt-5 text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight leading-[1.1] mb-4">
              Fleet management{" "}
              <span style={{ color: "#86efac" }}>in your pocket</span>
            </h1>
            <p className="text-base max-w-xl mx-auto mb-8 leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
              The native Android app gives drivers and fleet managers access to every feature of FleetShare — designed with Material Design 3 for a fast, modern experience on any Android device.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <ApkDownloadAnchor
                className="flex items-center justify-center gap-2 h-12 px-7 rounded-xl text-white font-semibold text-sm bg-[#185fa5] hover:bg-[#1d4ed8] shadow-[0_4px_20px_rgba(24,95,165,0.4)] transition-all"
              >
                <Download className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden />
                {t("landing.mobileApp.downloadApk")}
              </ApkDownloadAnchor>
              <Link href="/register"
                className="flex items-center justify-center gap-2 h-12 px-7 rounded-xl font-semibold text-sm border border-white/15 text-white/80 hover:bg-white/5 transition-all">
                Create Account First
              </Link>
            </div>
          </div>
        </section>

        {/* ── WHAT MAKES IT STAND OUT ── */}
        <section style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
          <div className="max-w-5xl mx-auto px-5 py-12">
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                { icon: Zap,       title: "Material Design 3",  desc: "Built with the latest Android design system — smooth transitions, adaptive layouts and accessible components." },
                { icon: Shield,    title: "Same data as web",    desc: "The Android app and web dashboard share the same backend. Changes reflect instantly on all platforms." },
                { icon: Download,  title: "APK direct install",  desc: "No Play Store listing needed. Install directly from your FleetShare portal, always synced to your deployment." },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="text-center">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                    style={{ background: "rgba(134,239,172,0.1)", border: "1px solid rgba(134,239,172,0.2)" }}>
                    <Icon className="w-6 h-6" style={{ color: "#86efac" }} strokeWidth={1.7} />
                  </div>
                  <h3 className="font-semibold text-white text-sm mb-1">{title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.48)" }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── ALL FEATURES ── */}
        <section className="max-w-6xl mx-auto px-5 py-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Everything in one app</h2>
            <p className="text-sm max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.5)" }}>
              {FEATURES.length} features built natively for Android — from booking to billing.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
          </div>
        </section>

        {/* ── REQUIREMENTS ── */}
        <section style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="max-w-4xl mx-auto px-5 py-12">
            <div className="grid sm:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold text-white mb-4">Requirements</h3>
                <ul className="space-y-2">
                  {["Android 7.0 (API 24) or higher", "Internet connection for sync", "Camera permission for document upload", "Notification permission for reminders"].map((r) => (
                    <li key={r} className="flex items-start gap-2 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
                      <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#86efac" }} />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-white mb-4">Built with</h3>
                <ul className="space-y-2">
                  {["Material Design 3 components", "Retrofit2 + OkHttp networking", "Gson JSON parsing", "ViewBinding + Fragment navigation", "Firebase push notifications"].map((r) => (
                    <li key={r} className="flex items-start gap-2 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
                      <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#7ec0ea" }} />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="max-w-6xl mx-auto px-5 pb-16">
          <div className="relative overflow-hidden rounded-2xl p-8 sm:p-12 text-center"
            style={{ background: "linear-gradient(135deg, rgba(134,239,172,0.12) 0%, rgba(24,95,165,0.25) 100%)", border: "1px solid rgba(134,239,172,0.2)" }}>
            <h2 className="text-2xl font-bold text-white mb-3">Ready to install?</h2>
            <p className="text-sm mb-7 max-w-lg mx-auto" style={{ color: "rgba(255,255,255,0.55)" }}>
              {t("landing.mobileApp.installFooterBody")}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center flex-wrap">
              <ApkDownloadAnchor
                className="flex items-center justify-center gap-2 h-12 px-7 rounded-xl text-white font-semibold text-sm bg-[#185fa5] hover:bg-[#1d4ed8] shadow-[0_4px_20px_rgba(24,95,165,0.45)] transition-all"
              >
                <Download className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden />
                {t("landing.mobileApp.installFooterDownloadAgain")}
              </ApkDownloadAnchor>
              <Link href="/register"
                className="flex items-center justify-center gap-2 h-12 px-7 rounded-xl font-semibold text-sm border border-white/15 text-white/80 hover:bg-white/5 transition-all">
                Create Account <ArrowRight className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden />
              </Link>
              <Link href="/contact"
                className="flex items-center justify-center gap-2 h-12 px-7 rounded-xl font-semibold text-sm border border-white/15 text-white/80 hover:bg-white/5 transition-all">
                Have questions?
              </Link>
            </div>
          </div>
        </section>

      </main>

      <LandingSiteFooter />
    </div>
  );
}
