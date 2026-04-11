"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import LandingSiteHeader from "@/components/landing/LandingSiteHeader";
import LandingSiteFooter from "@/components/landing/LandingSiteFooter";
import { Shield, FileText, HelpCircle, Cookie, ArrowLeft, ArrowRight } from "lucide-react";

const BASE = "#0c1220";
const ACCENT = "#f5a623";
const BLUE = "#185fa5";

// Icon + color per page type
const PAGE_META = {
  "legal.privacy": {
    icon: Shield,
    color: "#7ec0ea",
    bg: "rgba(24,95,165,0.18)",
    border: "rgba(24,95,165,0.35)",
  },
  "legal.terms": {
    icon: FileText,
    color: ACCENT,
    bg: "rgba(245,166,35,0.12)",
    border: "rgba(245,166,35,0.3)",
  },
  "legal.support": {
    icon: HelpCircle,
    color: "#86efac",
    bg: "rgba(134,239,172,0.1)",
    border: "rgba(134,239,172,0.25)",
  },
  "legal.cookies": {
    icon: Cookie,
    color: "#c4b5fd",
    bg: "rgba(196,181,253,0.1)",
    border: "rgba(196,181,253,0.25)",
  },
};

const RELATED_PAGES = [
  { href: "/privacy", labelKey: "landing.footer.privacy" },
  { href: "/terms",   labelKey: "landing.footer.terms" },
  { href: "/support", labelKey: "landing.footer.support" },
  { href: "/cookies", labelKey: "landing.footer.cookies" },
];

/**
 * @param {{ prefix: string }} props  e.g. "legal.privacy"
 */
export default function LegalDocPage({ prefix }) {
  const { t } = useI18n();

  const sections = [];
  for (let i = 1; i <= 12; i++) {
    const titleKey = `${prefix}.s${i}Title`;
    const bodyKey  = `${prefix}.s${i}Body`;
    const title = t(titleKey);
    const body  = t(bodyKey);
    if (title === titleKey || body === bodyKey) break;
    sections.push({ id: `section-${i}`, num: i, title, body });
  }

  const meta = PAGE_META[prefix] ?? PAGE_META["legal.privacy"];
  const Icon = meta.icon;
  const pageTitle = t(`${prefix}.pageTitle`);
  const updated   = t(`${prefix}.updated`);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BASE }}>
      <LandingSiteHeader />

      {/* ── Hero banner ── */}
      <section className="relative overflow-hidden border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[500px] h-[260px] rounded-full opacity-15"
            style={{ background: `radial-gradient(ellipse, ${BLUE} 0%, transparent 70%)` }} />
        </div>
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <Link href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold mb-6 transition-colors hover:text-white"
            style={{ color: "rgba(255,255,255,0.45)" }}>
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to home
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: meta.bg, border: `1px solid ${meta.border}` }}>
              <Icon className="w-6 h-6" style={{ color: meta.color }} strokeWidth={1.7} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight" style={{ letterSpacing: "-0.02em" }}>
                {pageTitle}
              </h1>
              {updated && (
                <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>{updated}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Body ── */}
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12 w-full">
        <div className="flex gap-10 items-start">

          {/* ── Sidebar: table of contents (desktop only) ── */}
          {sections.length > 1 && (
            <aside className="hidden lg:block w-52 shrink-0 sticky top-24">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
                Contents
              </p>
              <nav className="flex flex-col gap-1">
                {sections.map((s) => (
                  <a key={s.id} href={`#${s.id}`}
                    className="flex items-start gap-2 text-[12px] py-1 px-2 rounded-lg transition-colors hover:bg-white/5"
                    style={{ color: "rgba(255,255,255,0.5)" }}>
                    <span className="shrink-0 mt-0.5 text-[10px] font-bold tabular-nums"
                      style={{ color: "rgba(255,255,255,0.25)" }}>{s.num}.</span>
                    <span className="leading-snug hover:text-white transition-colors line-clamp-2">{s.title}</span>
                  </a>
                ))}
              </nav>

              {/* Related pages */}
              <div className="mt-8 pt-6 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Legal pages
                </p>
                <nav className="flex flex-col gap-1">
                  {RELATED_PAGES.map((p) => {
                    const label = t(p.labelKey);
                    const isCurrent = pageTitle === label;
                    return (
                      <Link key={p.href} href={p.href}
                        className="text-[12px] py-1 px-2 rounded-lg transition-colors hover:bg-white/5"
                        style={{ color: isCurrent ? ACCENT : "rgba(255,255,255,0.5)", fontWeight: isCurrent ? 600 : 400 }}>
                        {label}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </aside>
          )}

          {/* ── Main content ── */}
          <div className="flex-1 min-w-0">
            <div className="space-y-0">
              {sections.map((s, idx) => (
                <section key={s.id} id={s.id}
                  className="relative py-7 border-b"
                  style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  {/* Section number accent bar */}
                  <div className="flex items-baseline gap-3 mb-3">
                    <span className="text-[11px] font-bold tabular-nums shrink-0 leading-none"
                      style={{ color: meta.color, opacity: 0.7 }}>
                      {String(s.num).padStart(2, "0")}
                    </span>
                    <h2 className="text-base sm:text-[17px] font-semibold text-white leading-snug">
                      {s.title}
                    </h2>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-line pl-7"
                    style={{ color: "rgba(255,255,255,0.75)" }}>
                    {s.body}
                  </p>
                </section>
              ))}
            </div>

            {/* Disclaimer */}
            <div className="mt-10 p-4 rounded-2xl border"
              style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                {t("legal.disclaimer")}
              </p>
            </div>

            {/* Bottom nav between legal pages */}
            <div className="mt-8 pt-6 border-t flex flex-wrap gap-2" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              <p className="w-full text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                Other legal pages
              </p>
              {RELATED_PAGES.map((p) => {
                const label = t(p.labelKey);
                const isCurrent = pageTitle === label;
                if (isCurrent) return null;
                return (
                  <Link key={p.href} href={p.href}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all hover:bg-white/5"
                    style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.65)" }}>
                    {label} <ArrowRight className="w-3 h-3" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6">
        <LandingSiteFooter />
      </div>
    </div>
  );
}
