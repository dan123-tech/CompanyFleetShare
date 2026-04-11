"use client";

import Link from "next/link";
import { Car, Users, BarChart2, Shield, Server, Download, ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import LandingSiteHeader from "@/components/landing/LandingSiteHeader";
import LandingSiteFooter from "@/components/landing/LandingSiteFooter";
import { LANDING_COL } from "@/components/landing/landingTheme";

const COL = LANDING_COL;

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

  const exploreCardClass =
    "group flex flex-col gap-2 p-4 sm:p-5 rounded-xl sm:rounded-2xl border transition-colors hover:border-white/15 min-h-0 min-w-0 text-left";
  const exploreCardStyle = {
    background: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.07)",
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: COL.base }}>
      <LandingSiteHeader logoPriority />

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-5 w-full">
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

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5 pb-8 lg:pb-10">
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
          className="pb-10 sm:pb-12 border-t rounded-2xl px-4 sm:px-6 pt-8 sm:pt-10 mb-2"
          style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}
        >
          <h2 className="text-lg sm:text-xl font-bold text-white mb-1 text-center">{t("landing.homeExplore.title")}</h2>
          <p className="text-sm text-center max-w-xl mx-auto mb-6" style={{ color: "rgba(255,255,255,0.45)" }}>
            {t("landing.homeExplore.subtitle")}
          </p>
          <div className="grid sm:grid-cols-2 gap-3 max-w-3xl mx-auto">
            <Link href="/register" className={exploreCardClass} style={exploreCardStyle}>
              <span className="text-[13px] font-semibold text-white/90">{t("landing.sections.webTitle")}</span>
              <span className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                {t("landing.homeExplore.webHint")}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#7ec0ea] mt-1 group-hover:gap-2 transition-all">
                {t("landing.homeExplore.go")} <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
              </span>
            </Link>
            <Link href="/products/mobile" className={exploreCardClass} style={exploreCardStyle}>
              <span className="text-[13px] font-semibold text-white/90">{t("landing.sections.mobileTitle")}</span>
              <span className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                {t("landing.homeExplore.mobileHint")}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#7ec0ea] mt-1 group-hover:gap-2 transition-all">
                {t("landing.homeExplore.go")} <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
              </span>
            </Link>
            <Link href="/prices" className={exploreCardClass} style={exploreCardStyle}>
              <span className="text-[13px] font-semibold text-white/90">{t("landing.sections.pricesTitle")}</span>
              <span className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                {t("landing.homeExplore.pricesHint")}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#7ec0ea] mt-1 group-hover:gap-2 transition-all">
                {t("landing.homeExplore.go")} <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
              </span>
            </Link>
            <Link href="/contact" className={exploreCardClass} style={exploreCardStyle}>
              <span className="text-[13px] font-semibold text-white/90">{t("landing.sections.contactTitle")}</span>
              <span className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                {t("landing.homeExplore.contactHint")}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#7ec0ea] mt-1 group-hover:gap-2 transition-all">
                {t("landing.homeExplore.go")} <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
              </span>
            </Link>
          </div>
        </section>

        <LandingSiteFooter />
      </main>
    </div>
  );
}
