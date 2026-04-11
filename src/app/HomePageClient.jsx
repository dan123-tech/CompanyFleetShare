"use client";

import Link from "next/link";
import { Car, Users, BarChart2, Shield, Server, Download, ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import LanguageCurrencySwitcher from "@/components/LanguageCurrencySwitcher";
import FleetShareBrandBlock from "@/components/FleetShareBrandBlock";

const COL = {
  base: "#0c1220",
  primary: "#185fa5",
  secondary: "#1d4ed8",
  accent: "#f5a623",
};

const navLinkClass =
  "text-[13px] font-medium px-2.5 py-2 rounded-lg transition-colors hover:text-white/90 hover:bg-white/5 outline-none focus-visible:ring-2 focus-visible:ring-[#185fa5]/60";
const navMuted = { color: "rgba(255,255,255,0.72)" };

export default function HomePageClient() {
  const { t } = useI18n();

  const features = [
    {
      id: "fleet",
      icon: Car,
      titleKey: "landing.features.fleetTitle",
      descKey: "landing.features.fleetDesc",
    },
    {
      id: "team",
      icon: Users,
      titleKey: "landing.features.teamTitle",
      descKey: "landing.features.teamDesc",
    },
    {
      id: "ai",
      icon: Shield,
      titleKey: "landing.features.aiTitle",
      descKey: "landing.features.aiDesc",
    },
    {
      id: "cost",
      icon: BarChart2,
      titleKey: "landing.features.costTitle",
      descKey: "landing.features.costDesc",
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: COL.base }}>
      <header
        className="border-b sticky top-0 z-20"
        style={{
          borderColor: "rgba(255,255,255,0.07)",
          background: "rgba(12, 18, 32, 0.92)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-5 py-3 sm:py-3.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link href="/#home" className="flex items-center min-w-0 shrink-0 hover:opacity-90 transition-opacity">
            <FleetShareBrandBlock tone="dark" size="nav" priority className="max-w-[min(260px,70vw)] sm:max-w-[min(300px,82vw)]" />
          </Link>

          <nav
            className="flex flex-1 min-w-0 flex-wrap items-center gap-x-0.5 gap-y-1 sm:gap-x-1"
            aria-label="Primary"
          >
            <a href="#home" className={navLinkClass} style={navMuted}>
              {t("landing.nav.home")}
            </a>
            <details className="relative group">
              <summary
                className={`${navLinkClass} list-none cursor-pointer inline-flex items-center gap-1 [&::-webkit-details-marker]:hidden`}
                style={navMuted}
              >
                {t("landing.nav.products")}
                <ChevronDown className="w-3.5 h-3.5 opacity-70 shrink-0" strokeWidth={2} aria-hidden />
              </summary>
              <div
                className="absolute left-0 top-full z-30 mt-1 min-w-[min(100vw-2rem,260px)] rounded-xl border py-1.5 shadow-xl sm:min-w-[240px]"
                style={{
                  borderColor: "rgba(255,255,255,0.12)",
                  background: "rgba(12, 18, 32, 0.98)",
                  backdropFilter: "blur(12px)",
                }}
              >
                <a
                  href="#products-web"
                  className="block px-3 py-2.5 transition-colors hover:bg-white/5"
                  style={navMuted}
                >
                  <span className="block text-[13px] font-semibold text-white/90">{t("landing.nav.webTitle")}</span>
                  <span className="block text-[11px] mt-0.5 opacity-70">{t("landing.nav.webSub")}</span>
                </a>
                <a
                  href="#products-mobile"
                  className="block px-3 py-2.5 transition-colors hover:bg-white/5 border-t border-white/10"
                  style={navMuted}
                >
                  <span className="block text-[13px] font-semibold text-white/90">{t("landing.nav.mobileTitle")}</span>
                  <span className="block text-[11px] mt-0.5 opacity-70">{t("landing.nav.mobileSub")}</span>
                </a>
              </div>
            </details>
            <a href="#prices" className={navLinkClass} style={navMuted}>
              {t("landing.nav.prices")}
            </a>
            <a href="#contact" className={navLinkClass} style={navMuted}>
              {t("landing.nav.contact")}
            </a>
          </nav>

          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 shrink-0 ml-auto">
            <LanguageCurrencySwitcher variant="landing" showCurrency={false} />
            <div className="hidden sm:block w-px h-9 shrink-0 bg-white/15" aria-hidden />
            <Link
              href="/login"
              className="text-[13px] font-medium px-3 py-2 rounded-lg transition-colors hover:text-white/90 hover:bg-white/5"
              style={navMuted}
            >
              {t("landing.signIn")}
            </Link>
            <Link
              href="/register"
              className="text-[13px] font-semibold px-3.5 py-2 rounded-lg text-white transition-colors shadow-sm bg-[#185fa5] hover:bg-[#1d4ed8] border border-white/10"
            >
              {t("landing.getStarted")}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-5">
        <div id="home" className="pt-10 pb-6 sm:pt-14 sm:pb-8 md:pt-16 md:pb-8 text-center scroll-mt-24">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold mb-4"
            style={{
              background: "rgba(24, 95, 165, 0.22)",
              border: `1px solid rgba(24, 95, 165, 0.45)`,
              color: "#a8d4f5",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: COL.accent, boxShadow: `0 0 8px ${COL.accent}` }}
            />
            {t("landing.eyebrow")}
          </div>

          <h1
            className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3"
            style={{ letterSpacing: "-0.03em", lineHeight: 1.15 }}
          >
            <span style={{ color: COL.accent }}>{t("landing.heroAccentWord")}</span>
            <span className="text-white">{t("landing.heroLine1Rest")}</span>
            <br />
            <span className="text-white">{t("landing.heroLine2Before")}</span>
            <span style={{ color: COL.accent }}>{t("landing.heroLine2Accent")}</span>
            <span className="text-white">{t("landing.heroLine2After")}</span>
          </h1>
          <p
            className="text-sm sm:text-base max-w-xl mx-auto mb-5 md:mb-6"
            style={{ color: "rgba(255,255,255,0.48)", lineHeight: 1.6 }}
          >
            {t("landing.heroSub")}
          </p>

          <div className="flex flex-col items-center gap-2.5 sm:gap-3 mb-2 sm:mb-4">
            <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 justify-center w-full sm:w-auto">
              <Link
                href="/register"
                className="flex items-center justify-center h-12 px-6 rounded-xl text-white font-semibold text-sm transition-colors bg-[#185fa5] hover:bg-[#1d4ed8] shadow-[0_2px_10px_rgba(24,95,165,0.4)]"
              >
                {t("landing.ctaPrimary")}
              </Link>
              <Link
                href="/login"
                className="flex items-center justify-center h-12 px-6 rounded-xl font-semibold text-sm transition-all hover:border-white/20"
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.7)",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                {t("landing.ctaSecondary")}
              </Link>
            </div>
            <Link
              href="/download"
              className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl font-semibold text-sm transition-all hover:border-white/20 w-full sm:w-auto sm:min-w-[200px]"
              style={{
                border: "1px solid rgba(245, 166, 35, 0.35)",
                color: "rgba(255,255,255,0.85)",
                background: "rgba(245, 166, 35, 0.08)",
              }}
            >
              <Download className="w-4 h-4 shrink-0" style={{ color: COL.accent }} strokeWidth={2} aria-hidden />
              {t("landing.ctaDownload")}
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5 pb-12 lg:pb-16">
          <div
            className="col-span-2 lg:col-span-4 p-4 sm:p-6 rounded-xl sm:rounded-2xl flex flex-col items-center text-center gap-4 min-w-0"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "rgba(24, 95, 165, 0.22)",
                border: "1px solid rgba(24, 95, 165, 0.4)",
              }}
            >
              <Server className="w-5 h-5 sm:w-[22px] sm:h-[22px]" style={{ color: "#7ec0ea" }} strokeWidth={1.6} />
            </div>
            <div className="min-w-0 w-full max-w-3xl mx-auto">
              <h3
                className="font-semibold text-[14px] sm:text-base mb-1.5 leading-tight"
                style={{ color: COL.accent }}
              >
                {t("landing.selfHostedTitle")}
              </h3>
              <p
                className="text-[12px] sm:text-sm leading-relaxed sm:leading-relaxed"
                style={{ color: "rgba(255,255,255,0.45)" }}
              >
                {t("landing.selfHostedDesc")}
              </p>
            </div>
          </div>
          {features.map(({ id, icon: Icon, titleKey, descKey }) => (
            <div
              key={id}
              className="p-3 sm:p-5 rounded-xl sm:rounded-2xl flex flex-col min-h-0 min-w-0"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center mb-3 shrink-0"
                style={{
                  background: "rgba(24, 95, 165, 0.22)",
                  border: "1px solid rgba(24, 95, 165, 0.4)",
                }}
              >
                <Icon className="w-[16px] h-[16px] sm:w-[18px] sm:h-[18px]" style={{ color: "#7ec0ea" }} strokeWidth={1.6} />
              </div>
              <h3
                className="font-semibold text-[13px] sm:text-[15px] mb-1 leading-tight"
                style={{ color: COL.accent }}
              >
                {t(titleKey)}
              </h3>
              <p
                className="text-[11px] sm:text-sm leading-snug sm:leading-relaxed line-clamp-3 sm:line-clamp-4 lg:line-clamp-none"
                style={{ color: "rgba(255,255,255,0.45)" }}
              >
                {t(descKey)}
              </p>
            </div>
          ))}
        </div>

        <section
          id="products-web"
          className="scroll-mt-24 py-10 sm:py-12 border-t rounded-2xl px-4 sm:px-6 mb-6"
          style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}
        >
          <h2 className="text-lg sm:text-xl font-bold text-white mb-2">{t("landing.sections.webTitle")}</h2>
          <p className="text-sm max-w-2xl mb-4" style={{ color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
            {t("landing.sections.webBody")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/register"
              className="inline-flex items-center justify-center h-10 px-4 rounded-lg text-sm font-semibold text-white bg-[#185fa5] hover:bg-[#1d4ed8] transition-colors"
            >
              {t("landing.sections.webCta")}
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center h-10 px-4 rounded-lg text-sm font-semibold border border-white/15 text-white/85 hover:bg-white/5 transition-colors"
            >
              {t("landing.signIn")}
            </Link>
          </div>
        </section>

        <section
          id="products-mobile"
          className="scroll-mt-24 py-10 sm:py-12 border-t rounded-2xl px-4 sm:px-6 mb-6"
          style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}
        >
          <h2 className="text-lg sm:text-xl font-bold mb-2" style={{ color: COL.accent }}>
            {t("landing.sections.mobileTitle")}
          </h2>
          <p className="text-sm max-w-2xl mb-4" style={{ color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
            {t("landing.sections.mobileBody")}
          </p>
          <Link
            href="/download"
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg text-sm font-semibold border transition-colors"
            style={{
              borderColor: "rgba(245, 166, 35, 0.4)",
              color: "rgba(255,255,255,0.9)",
              background: "rgba(245, 166, 35, 0.1)",
            }}
          >
            <Download className="w-4 h-4 shrink-0" style={{ color: COL.accent }} strokeWidth={2} aria-hidden />
            {t("landing.sections.mobileCta")}
          </Link>
        </section>

        <section
          id="prices"
          className="scroll-mt-24 py-10 sm:py-12 border-t rounded-2xl px-4 sm:px-6 mb-6"
          style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}
        >
          <h2 className="text-lg sm:text-xl font-bold text-white mb-2">{t("landing.sections.pricesTitle")}</h2>
          <p className="text-sm max-w-2xl mb-4" style={{ color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
            {t("landing.sections.pricesBody")}
          </p>
          <a
            href="#contact"
            className="inline-flex items-center justify-center h-10 px-4 rounded-lg text-sm font-semibold text-white bg-[#185fa5] hover:bg-[#1d4ed8] transition-colors"
          >
            {t("landing.sections.pricesCta")}
          </a>
        </section>

        <section
          id="contact"
          className="scroll-mt-24 py-10 sm:py-12 border-t rounded-2xl px-4 sm:px-6 mb-10"
          style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}
        >
          <h2 className="text-lg sm:text-xl font-bold text-white mb-2">{t("landing.sections.contactTitle")}</h2>
          <p className="text-sm max-w-2xl mb-4" style={{ color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
            {t("landing.sections.contactBody")}
          </p>
          <Link
            href="/support"
            className="inline-flex items-center justify-center h-10 px-4 rounded-lg text-sm font-semibold border border-white/15 text-white/85 hover:bg-white/5 transition-colors"
          >
            {t("landing.sections.contactSupport")}
          </Link>
        </section>

        <div
          className="pb-8 text-center border-t pt-6"
          style={{ borderColor: "rgba(255,255,255,0.07)" }}
        >
          <div
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs"
            style={{ color: "rgba(255,255,255,0.25)" }}
          >
            <span>{t("common.copyright")}</span>
            <span aria-hidden>·</span>
            <Link
              href="/privacy"
              className="hover:underline text-[#185fa5] hover:text-[#1d4ed8] transition-colors"
            >
              {t("landing.footer.privacy")}
            </Link>
            <span aria-hidden>·</span>
            <Link
              href="/terms"
              className="hover:underline text-[#185fa5] hover:text-[#1d4ed8] transition-colors"
            >
              {t("landing.footer.terms")}
            </Link>
            <span aria-hidden>·</span>
            <Link
              href="/support"
              className="hover:underline text-[#185fa5] hover:text-[#1d4ed8] transition-colors"
            >
              {t("landing.footer.support")}
            </Link>
            <span aria-hidden>·</span>
            <Link
              href="/cookies"
              className="hover:underline text-[#185fa5] hover:text-[#1d4ed8] transition-colors"
            >
              {t("landing.footer.cookies")}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
