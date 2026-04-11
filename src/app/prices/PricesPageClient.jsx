"use client";

import Link from "next/link";
import { CheckCircle, ArrowRight, Server, Zap, Building2, HelpCircle } from "lucide-react";
import LandingSiteHeader from "@/components/landing/LandingSiteHeader";
import LandingSiteFooter from "@/components/landing/LandingSiteFooter";
import { LANDING_COL } from "@/components/landing/landingTheme";

const COL = LANDING_COL;

function Badge({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-widest"
      style={{ background: "rgba(24,95,165,0.2)", border: "1px solid rgba(24,95,165,0.4)", color: "#93c5fd" }}>
      <span className="w-1.5 h-1.5 rounded-full bg-[#f5a623] shrink-0" />
      {children}
    </span>
  );
}

const PLANS = [
  {
    id: "starter",
    icon: Zap,
    name: "Starter",
    price: "Free",
    priceSub: "forever",
    accent: "#7ec0ea",
    accentBg: "rgba(24,95,165,0.15)",
    accentBorder: "rgba(24,95,165,0.3)",
    highlight: false,
    description: "Perfect for small teams getting started with fleet management.",
    cta: "Get Started Free",
    ctaHref: "/register",
    ctaStyle: "outline",
    features: [
      "Up to 5 vehicles",
      "Unlimited drivers",
      "Scheduled & instant reservations",
      "Automatic journey sheet PDFs",
      "Digital Glovebox (ITP, RCA, vignette)",
      "Incident reporting with files",
      "Booking calendar",
      "Basic statistics dashboard",
      "Android app included",
      "Email support",
    ],
  },
  {
    id: "professional",
    icon: Building2,
    name: "Professional",
    price: "Custom",
    priceSub: "contact us for pricing",
    accent: "#f5a623",
    accentBg: "rgba(245,166,35,0.12)",
    accentBorder: "rgba(245,166,35,0.35)",
    highlight: true,
    description: "For growing fleets that need advanced analytics and full reporting.",
    cta: "Contact Sales",
    ctaHref: "/contact",
    ctaStyle: "primary",
    badge: "Most popular",
    features: [
      "Unlimited vehicles",
      "Unlimited drivers",
      "Everything in Starter, plus:",
      "AI-powered driving licence verification",
      "Advanced analytics & cost tracking",
      "Monthly cost reports (PDF)",
      "Excel / CSV data export",
      "KM heatmap & top-driver rankings",
      "Maintenance scheduling & alerts",
      "Full audit log",
      "Multi-currency support (EUR, RON, USD, GBP)",
      "Bilingual interface (EN / RO)",
      "Priority email & chat support",
    ],
  },
  {
    id: "enterprise",
    icon: Server,
    name: "Enterprise",
    price: "Self-hosted",
    priceSub: "one-time or subscription",
    accent: "#86efac",
    accentBg: "rgba(134,239,172,0.1)",
    accentBorder: "rgba(134,239,172,0.25)",
    highlight: false,
    description: "Run FleetShare on your own infrastructure with full data sovereignty.",
    cta: "Talk to Us",
    ctaHref: "/contact",
    ctaStyle: "outline",
    features: [
      "Everything in Professional, plus:",
      "Deploy on your own server or VPS",
      "Docker-based setup",
      "PostgreSQL database — your data",
      "White-label branding",
      "Custom domain",
      "On-premise or cloud deployment",
      "Dedicated setup assistance",
      "SLA-backed support",
    ],
  },
];

const COMPARISON = [
  { feature: "Vehicles",                  starter: "Up to 5",   pro: "Unlimited",    enterprise: "Unlimited" },
  { feature: "Drivers",                   starter: "Unlimited", pro: "Unlimited",    enterprise: "Unlimited" },
  { feature: "Reservations",              starter: "✓",         pro: "✓",            enterprise: "✓" },
  { feature: "Journey sheet PDF",         starter: "✓",         pro: "✓",            enterprise: "✓" },
  { feature: "Android app",              starter: "✓",         pro: "✓",            enterprise: "✓" },
  { feature: "Digital Glovebox",          starter: "✓",         pro: "✓",            enterprise: "✓" },
  { feature: "Incident reporting",        starter: "✓",         pro: "✓",            enterprise: "✓" },
  { feature: "AI licence verification",   starter: "—",         pro: "✓",            enterprise: "✓" },
  { feature: "Advanced analytics",        starter: "—",         pro: "✓",            enterprise: "✓" },
  { feature: "Excel / PDF export",        starter: "—",         pro: "✓",            enterprise: "✓" },
  { feature: "Monthly cost reports",      starter: "—",         pro: "✓",            enterprise: "✓" },
  { feature: "Full audit log",            starter: "—",         pro: "✓",            enterprise: "✓" },
  { feature: "Self-hosted deployment",    starter: "—",         pro: "—",            enterprise: "✓" },
  { feature: "White-label branding",      starter: "—",         pro: "—",            enterprise: "✓" },
  { feature: "SLA support",              starter: "—",         pro: "—",            enterprise: "✓" },
];

const FAQS = [
  {
    q: "Is the Starter plan really free forever?",
    a: "Yes. The Starter plan is free with no time limit. It is designed for small organisations with up to 5 vehicles that need the core features.",
  },
  {
    q: "What happens if I exceed 5 vehicles on Starter?",
    a: "You will need to upgrade to the Professional plan. Contact us and we will help you migrate with zero data loss.",
  },
  {
    q: "Can I try Professional features before paying?",
    a: "Yes — contact us for a free trial period. We will enable Professional features on your account so you can evaluate them with your real fleet data.",
  },
  {
    q: "What does 'self-hosted' mean exactly?",
    a: "You run the entire application — Next.js server, PostgreSQL database and file storage — on infrastructure you control. We provide Docker Compose files and setup guidance.",
  },
  {
    q: "Is the Android app included in all plans?",
    a: "Yes. The Android APK is downloadable from your dashboard on every plan at no extra cost.",
  },
  {
    q: "Do you offer discounts for non-profits or education?",
    a: "Yes — please contact us with details about your organisation and we will provide a custom quote.",
  },
];

export default function PricesPageClient() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: COL.base }}>
      <LandingSiteHeader />

      <main className="flex-1 w-full">

        {/* ── HERO ── */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-20"
              style={{ background: "radial-gradient(ellipse, #185fa5 0%, transparent 70%)" }} />
          </div>
          <div className="relative max-w-3xl mx-auto px-5 pt-14 pb-12 text-center">
            <Badge>Pricing</Badge>
            <h1 className="mt-5 text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
              Simple, transparent pricing
            </h1>
            <p className="text-base max-w-lg mx-auto leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
              Start free, scale when you need to. No hidden fees, no per-seat charges.
            </p>
          </div>
        </section>

        {/* ── PLANS ── */}
        <section className="max-w-6xl mx-auto px-5 pb-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PLANS.map((plan) => {
              const Icon = plan.icon;
              return (
                <div key={plan.id}
                  className="relative flex flex-col rounded-2xl p-6 border"
                  style={{
                    background: plan.highlight ? "rgba(245,166,35,0.06)" : "rgba(255,255,255,0.04)",
                    borderColor: plan.highlight ? plan.accentBorder : "rgba(255,255,255,0.09)",
                    boxShadow: plan.highlight ? "0 0 40px rgba(245,166,35,0.08)" : "none",
                  }}>
                  {plan.badge && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest"
                        style={{ background: plan.accent, color: "#0c1220" }}>
                        {plan.badge}
                      </span>
                    </div>
                  )}

                  {/* Plan header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: plan.accentBg, border: `1px solid ${plan.accentBorder}` }}>
                      <Icon className="w-4.5 h-4.5 w-5 h-5" style={{ color: plan.accent }} strokeWidth={1.7} />
                    </div>
                    <span className="font-bold text-white text-base">{plan.name}</span>
                  </div>

                  <div className="mb-2">
                    <span className="text-3xl font-bold text-white">{plan.price}</span>
                    <span className="text-xs ml-2" style={{ color: "rgba(255,255,255,0.45)" }}>{plan.priceSub}</span>
                  </div>
                  <p className="text-[12.5px] mb-6 leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                    {plan.description}
                  </p>

                  <Link href={plan.ctaHref}
                    className={`flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold mb-6 transition-all ${
                      plan.ctaStyle === "primary"
                        ? "text-[#0c1220] shadow-[0_4px_16px_rgba(245,166,35,0.3)] hover:opacity-90"
                        : "border text-white/85 hover:bg-white/5"
                    }`}
                    style={plan.ctaStyle === "primary" ? { background: plan.accent } : { borderColor: `${plan.accent}55` }}>
                    {plan.cta} <ArrowRight className="w-4 h-4" />
                  </Link>

                  <ul className="space-y-2.5 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className={`flex items-start gap-2 text-[12.5px] leading-snug ${f.endsWith(":") ? "font-semibold text-white/80 mt-3 first:mt-0" : ""}`}
                        style={{ color: f.endsWith(":") ? undefined : "rgba(255,255,255,0.65)" }}>
                        {!f.endsWith(":") && (
                          <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: plan.accent }} />
                        )}
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── COMPARISON TABLE ── */}
        <section style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
          <div className="max-w-5xl mx-auto px-5 py-14">
            <h2 className="text-2xl font-bold text-white text-center mb-2">Feature comparison</h2>
            <p className="text-sm text-center mb-8" style={{ color: "rgba(255,255,255,0.5)" }}>
              A full breakdown of what is included in each plan.
            </p>
            <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: "rgba(255,255,255,0.09)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <th className="text-left py-4 px-5 font-semibold text-white/70">Feature</th>
                    {["Starter", "Professional", "Enterprise"].map((h) => (
                      <th key={h} className="text-center py-4 px-4 font-bold text-white">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row, i) => (
                    <tr key={row.feature}
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                      <td className="py-3 px-5 text-white/70">{row.feature}</td>
                      {[row.starter, row.pro, row.enterprise].map((val, j) => (
                        <td key={j} className="py-3 px-4 text-center">
                          <span style={{ color: val === "—" ? "rgba(255,255,255,0.25)" : val === "✓" ? "#86efac" : "rgba(255,255,255,0.8)", fontWeight: val !== "—" && val !== "✓" ? 600 : undefined, fontSize: val === "✓" ? 16 : undefined }}>
                            {val}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="max-w-3xl mx-auto px-5 py-14">
          <h2 className="text-2xl font-bold text-center mb-8" style={{ color: "#ffffff" }}>Frequently asked questions</h2>
          <div className="flex flex-col gap-4">
            {FAQS.map((faq) => (
              <div key={faq.q} className="p-5 rounded-2xl border"
                style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.09)" }}>
                <div className="flex items-start gap-3">
                  <HelpCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#7ec0ea" }} />
                  <div>
                    <p className="font-semibold text-white text-sm mb-1.5">{faq.q}</p>
                    <p className="text-[12.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>{faq.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="max-w-6xl mx-auto px-5 pb-16">
          <div className="relative overflow-hidden rounded-2xl p-8 sm:p-12 text-center"
            style={{ background: "linear-gradient(135deg, rgba(24,95,165,0.3) 0%, rgba(29,78,216,0.2) 100%)", border: "1px solid rgba(24,95,165,0.4)" }}>
            <h2 className="text-2xl font-bold mb-3" style={{ color: "#ffffff" }}>Still have questions?</h2>
            <p className="text-sm mb-7 max-w-md mx-auto" style={{ color: "rgba(255,255,255,0.55)" }}>
              Our team is happy to walk you through the plans and help you choose the right one.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/contact"
                className="flex items-center justify-center gap-2 h-12 px-7 rounded-xl text-white font-semibold text-sm bg-[#185fa5] hover:bg-[#1d4ed8] transition-all shadow-[0_4px_20px_rgba(24,95,165,0.45)]">
                Contact Sales <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/register"
                className="flex items-center justify-center gap-2 h-12 px-7 rounded-xl font-semibold text-sm border border-white/15 text-white/80 hover:bg-white/5 transition-all">
                Start Free
              </Link>
            </div>
          </div>
        </section>

      </main>

      <LandingSiteFooter />
    </div>
  );
}
