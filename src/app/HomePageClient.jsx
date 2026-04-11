"use client";

import Link from "next/link";
import {
  Car, Users, BarChart2, Shield, Server, ArrowRight,
  Smartphone, FileText, Zap, MapPin, Bell, Wrench,
  CheckCircle, Download, Globe, Lock, TrendingUp, Calendar,
  ClipboardList, BookOpen, Star,
} from "lucide-react";
import LandingSiteHeader from "@/components/landing/LandingSiteHeader";
import LandingSiteFooter from "@/components/landing/LandingSiteFooter";
import { LANDING_COL } from "@/components/landing/landingTheme";

const COL = LANDING_COL;
const BASE = COL.base; // #0c1220

// ── Helpers ──────────────────────────────────────────────────────────────────
function Badge({ children }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-widest"
      style={{ background: "rgba(24,95,165,0.2)", border: "1px solid rgba(24,95,165,0.4)", color: "#93c5fd" }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[#f5a623] shrink-0" style={{ boxShadow: "0 0 6px #f5a623" }} />
      {children}
    </span>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#93c5fd" }}>
      {children}
    </p>
  );
}

function FeatureCard({ icon: Icon, title, desc, accent, titleColor }) {
  return (
    <div
      className="group p-5 rounded-2xl border flex flex-col gap-3 transition-all hover:border-white/20"
      style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "rgba(24,95,165,0.22)", border: "1px solid rgba(24,95,165,0.35)" }}
      >
        <Icon className="w-5 h-5" style={{ color: accent ?? "#7ec0ea" }} strokeWidth={1.7} />
      </div>
      <div>
        <h3 className="font-semibold text-[14px] mb-1 leading-snug" style={{ color: titleColor ?? COL.accent }}>{title}</h3>
        <p className="text-[12.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>{desc}</p>
      </div>
    </div>
  );
}

function StepCard({ num, title, desc }) {
  return (
    <div className="flex gap-4 items-start">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
        style={{ background: "rgba(24,95,165,0.25)", border: "1px solid rgba(24,95,165,0.5)", color: "#93c5fd" }}
      >
        {num}
      </div>
      <div>
        <h4 className="font-semibold text-white text-sm mb-1">{title}</h4>
        <p className="text-[12.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.78)" }}>{desc}</p>
      </div>
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────
const WEB_FEATURES = [
  { icon: Car,         title: "Real-time Fleet Dashboard",      desc: "See every vehicle's live status — available, reserved or in maintenance — on a single screen. Filter, sort, and act instantly." },
  { icon: Calendar,    title: "Smart Reservation System",       desc: "Drivers book cars in advance or grab one instantly with Reserve Now. Auto-detects conflicts, sends pickup & release codes." },
  { icon: FileText,    title: "Automatic Journey Sheet PDF",    desc: "Legal-grade journey sheets generated automatically on trip release — with actual timestamps, odometer, driver signature blocks." },
  { icon: Shield,      title: "AI Identity Verification",       desc: "Driving licence photos verified by AWS Rekognition before a driver can make their first booking. No manual review needed." },
  { icon: BarChart2,   title: "Analytics & Cost Tracking",      desc: "Monthly cost reports, km heatmaps, fuel expense tracking, CO₂ emissions, and top-driver leaderboards across any time window." },
  { icon: Download,    title: "Excel / PDF Export",             desc: "Export the full fleet dataset — reservations, km logs, fuel costs, maintenance — to branded PDF or multi-sheet Excel at any time." },
  { icon: BookOpen,    title: "Digital Glovebox",               desc: "ITP, RCA and vignette documents always accessible in-app, with expiry warnings before they run out." },
  { icon: ClipboardList, title: "Incident Reporting",           desc: "Drivers submit incidents with photos, documents and severity ratings. Admins review, track status and attach notes." },
  { icon: Wrench,      title: "Maintenance Scheduling",         desc: "Log service events with odometer reading, cost, and notes. Get maintenance-due alerts when a car exceeds 10 000 km since last service." },
  { icon: Lock,        title: "Role-based Access Control",      desc: "ADMIN and USER roles with granular driving-licence approval workflow. Every sensitive action recorded in the full audit log." },
  { icon: Globe,       title: "Bilingual & Multi-currency",     desc: "Full Romanian/English interface. Support for EUR, RON, USD and GBP — switch at any time without losing any data." },
  { icon: Server,      title: "Self-hosted Option",             desc: "Run FleetShare on your own infrastructure — Docker, VPS or on-prem. Full control over data sovereignty and compliance." },
];

const ANDROID_FEATURES = [
  { icon: Smartphone,  title: "Full Fleet Control on Mobile",   desc: "Manage cars, users, reservations and incidents from your phone — the entire admin panel in your pocket." },
  { icon: Zap,         title: "One-tap Reserve Now",            desc: "Drivers take a car instantly. The timer starts at tap and stops at release — exact timestamps flow into the journey sheet." },
  { icon: Bell,        title: "Push Notification Reminders",    desc: "Automatic alarms remind drivers 30 min before pickup. Never miss a reservation start or a scheduled return." },
  { icon: BookOpen,    title: "Mobile Digital Glovebox",        desc: "ITP, RCA and vignette expiry dates always in reach. View the RCA document PDF directly from the Android app." },
  { icon: ClipboardList, title: "Incident Reporting with Files", desc: "Report incidents on-site. Attach photos, PDFs and Word documents directly from the Android file picker." },
  { icon: BarChart2,   title: "Reports & Journey Sheet",        desc: "Download branded PDF reports and individual journey sheets with a single tap, saving directly to the device." },
  { icon: Calendar,    title: "Booking Calendar View",          desc: "Visualise the full fleet schedule. Filter by car to see what's booked, active or completed in a scrollable calendar." },
  { icon: MapPin,      title: "Maintenance Tracker",            desc: "Log maintenance events, track odometer readings and see which vehicles are due for service — all from the app." },
  { icon: TrendingUp,  title: "Statistics Dashboard",           desc: "Key KPIs at a glance: active reservations, km driven, estimated fuel cost and CO₂ for any selected time window." },
];

const STATS = [
  { value: "2-platform", label: "Web + Android" },
  { value: "12+", label: "Report types" },
  { value: "AI-powered", label: "ID verification" },
  { value: "100%", label: "Data ownership" },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function HomePageClient() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: BASE }}>
      <LandingSiteHeader logoPriority />

      <main className="flex-1 w-full">

        {/* ── HERO ── */}
        <section className="relative overflow-hidden">
          {/* Glow orbs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full opacity-20"
              style={{ background: "radial-gradient(ellipse, #185fa5 0%, transparent 70%)" }} />
            <div className="absolute top-40 -right-24 w-72 h-72 rounded-full opacity-10"
              style={{ background: "radial-gradient(circle, #f5a623 0%, transparent 70%)" }} />
          </div>

          <div className="relative max-w-6xl mx-auto px-4 sm:px-5 pt-12 pb-16 text-center">
            <Badge>Fleet Management</Badge>

            <h1 className="mt-5 text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight leading-[1.15] mb-4">
              <span style={{ color: COL.accent }}>Manage</span>
              <span className="text-white"> your entire fleet</span>
              <br />
              <span className="text-white">from </span>
              <span style={{ color: COL.accent }}>one place</span>
            </h1>
            <p className="text-sm sm:text-base max-w-xl mx-auto mb-7 leading-relaxed px-2" style={{ color: "rgba(255,255,255,0.65)" }}>
              FleetShare gives fleet managers and drivers a complete toolkit — web dashboard, Android app, automated
              journey sheets, AI identity checks, live analytics and much more.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center mb-10">
              <Link href="/register"
                className="flex items-center justify-center gap-2 h-12 px-7 rounded-xl text-white font-semibold text-sm bg-[#185fa5] hover:bg-[#1d4ed8] shadow-[0_4px_20px_rgba(24,95,165,0.45)] transition-all">
                Get Started Free <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/prices"
                className="flex items-center justify-center gap-2 h-12 px-7 rounded-xl font-semibold text-sm transition-all"
                style={{ border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.85)", background: "rgba(255,255,255,0.05)" }}>
                View Pricing
              </Link>
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-white/10 max-w-xl mx-auto">
              {STATS.map((s) => (
                <div key={s.label} className="flex flex-col items-center py-4 px-2"
                  style={{ background: "rgba(255,255,255,0.05)" }}>
                  <span className="text-base sm:text-lg font-bold text-white">{s.value}</span>
                  <span className="text-[10px] sm:text-[11px] mt-0.5 text-center" style={{ color: "rgba(255,255,255,0.55)" }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── WEB APP FEATURES ── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-5 py-12 sm:py-16">
          <div className="text-center mb-8 sm:mb-10">
            <SectionLabel>Web Application</SectionLabel>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-3">
              Everything you need to run a modern fleet
            </h2>
            <p className="text-sm max-w-xl mx-auto leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
              A full-featured web dashboard built for fleet managers — from the first car registration to monthly cost reports.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-3.5">
            {WEB_FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
          </div>
        </section>

        {/* ── ANDROID APP FEATURES ── */}
        <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-5 py-12 sm:py-16">
            <div className="text-center mb-8 sm:mb-10">
              <SectionLabel>Android Application</SectionLabel>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-3" style={{ color: COL.accent }}>
                Full fleet power in your pocket
              </h2>
              <p className="text-sm max-w-xl mx-auto leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
                The native Android app mirrors every web feature with a Material Design 3 interface, push notifications and offline-capable views.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-3.5">
              {ANDROID_FEATURES.map((f) => (
                <FeatureCard key={f.title} {...f} accent="#7ec0ea" titleColor="#ffffff" />
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link href="/products/mobile"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-white/15 text-white/80 hover:bg-white/5 transition-all">
                Explore Android App <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-5 py-12 sm:py-16">
          <div className="grid md:grid-cols-2 gap-8 sm:gap-10 items-start">
            <div>
              <SectionLabel>How it works</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-8" style={{ color: COL.accent }}>
                Up and running in minutes
              </h2>
              <div className="flex flex-col gap-7">
                <StepCard num="1" title="Create your company account"
                  desc="Register your organisation in seconds. Add your fleet of cars with registration numbers, fuel types and consumption rates." />
                <StepCard num="2" title="Invite drivers"
                  desc="Send invitations by email. Drivers upload their licence photo — AI verifies it automatically before they can book." />
                <StepCard num="3" title="Book, drive, release"
                  desc="Drivers reserve a car on web or Android, get a pickup code, drive, and release with an odometer reading. Journey sheet is generated automatically." />
                <StepCard num="4" title="Analyse & report"
                  desc="Review costs, km heatmaps, incidents and maintenance from the Statistics dashboard. Export any data to Excel or PDF at any time." />
              </div>
            </div>
            <div className="flex flex-col gap-4">
              {[
                { icon: CheckCircle, text: "No per-seat licensing fees — invite unlimited drivers" },
                { icon: CheckCircle, text: "Works on any device: browser + native Android app" },
                { icon: CheckCircle, text: "Legal journey sheets generated with zero manual work" },
                { icon: CheckCircle, text: "Real-time conflict detection prevents double bookings" },
                { icon: CheckCircle, text: "AI-powered driving licence verification built-in" },
                { icon: CheckCircle, text: "Full audit log of every action for compliance" },
                { icon: CheckCircle, text: "Self-host on your own servers for full data control" },
                { icon: CheckCircle, text: "Bilingual (English / Romanian) & multi-currency" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-3">
                  <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#86efac" }} />
                  <span className="text-sm leading-snug text-white">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA BANNER ── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-5 pb-12 sm:pb-16">
          <div className="relative overflow-hidden rounded-2xl p-7 sm:p-12 text-center"
            style={{ background: "linear-gradient(135deg, rgba(24,95,165,0.35) 0%, rgba(29,78,216,0.25) 100%)", border: "1px solid rgba(24,95,165,0.4)" }}>
            <div className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(ellipse at 50% -20%, rgba(24,95,165,0.3) 0%, transparent 70%)" }} />
            <div className="relative">
              <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: COL.accent }}>
                Ready to modernise your fleet?
              </h2>
              <p className="text-sm max-w-md mx-auto mb-7 text-white">
                Start for free — no credit card required. Set up your fleet in under 10 minutes.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
                <Link href="/register"
                  className="flex items-center justify-center gap-2 h-12 px-8 rounded-xl text-white font-semibold text-sm bg-[#185fa5] hover:bg-[#1d4ed8] shadow-[0_4px_20px_rgba(24,95,165,0.5)] transition-all">
                  Create Free Account <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/contact"
                  className="flex items-center justify-center gap-2 h-12 px-8 rounded-xl font-semibold text-sm border border-white/20 text-white hover:bg-white/10 transition-all">
                  Talk to Sales
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── EXPLORE LINKS ── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-5 pb-12 sm:pb-16">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { href: "/products/mobile", label: "Android App",  hint: "Features, download link and technical specs for the native mobile app." },
              { href: "/prices",          label: "Pricing",       hint: "Transparent plans for teams of every size, plus self-hosted options." },
              { href: "/contact",         label: "Contact Sales", hint: "Talk to us about custom deployments, pricing or a live demo." },
              { href: "/support",         label: "Support Docs",  hint: "Guides, FAQs and setup instructions for admins and drivers." },
            ].map((c) => (
              <Link key={c.href} href={c.href}
                className="group flex flex-col gap-2 p-4 sm:p-5 rounded-2xl border hover:border-white/20 transition-all"
                style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" }}>
                <span className="text-xs sm:text-sm font-semibold text-white/90">{c.label}</span>
                <span className="text-[11px] sm:text-[12px] leading-relaxed hidden sm:block" style={{ color: "rgba(255,255,255,0.55)" }}>{c.hint}</span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#7ec0ea] mt-auto pt-2 group-hover:gap-2 transition-all">
                  Explore <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
                </span>
              </Link>
            ))}
          </div>
        </section>

      </main>

      <LandingSiteFooter />
    </div>
  );
}
