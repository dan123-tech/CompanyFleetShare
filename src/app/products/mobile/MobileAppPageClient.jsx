"use client";

import Link from "next/link";
import LandingPageShell from "@/components/landing/LandingPageShell";
import { LANDING_COL } from "@/components/landing/landingTheme";
import { useI18n } from "@/i18n/I18nProvider";

const BULLET_KEYS = [
  "landing.mobileApp.bullet1",
  "landing.mobileApp.bullet2",
  "landing.mobileApp.bullet3",
  "landing.mobileApp.bullet4",
  "landing.mobileApp.bullet5",
  "landing.mobileApp.bullet6",
  "landing.mobileApp.bullet7",
  "landing.mobileApp.bullet8",
  "landing.mobileApp.bullet9",
];

export default function MobileAppPageClient() {
  const { t } = useI18n();

  return (
    <LandingPageShell>
      <article
        className="max-w-3xl rounded-2xl border px-5 py-8 sm:px-8 sm:py-10"
        style={{
          borderColor: "rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">{t("landing.mobileApp.title")}</h1>
        <p className="text-sm font-medium mb-1" style={{ color: LANDING_COL.accent }}>
          {t("landing.mobileApp.subtitle")}
        </p>
        <p className="text-sm mb-8 leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
          {t("landing.mobileApp.intro")}
        </p>
        <ul className="space-y-3 mb-10 list-disc pl-5 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.78)" }}>
          {BULLET_KEYS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/register"
            className="inline-flex items-center justify-center h-10 px-4 rounded-lg text-sm font-semibold text-white bg-[#185fa5] hover:bg-[#1d4ed8] transition-colors"
          >
            {t("landing.mobileApp.ctaRegister")}
          </Link>
          <Link
            href="/support"
            className="inline-flex items-center justify-center h-10 px-4 rounded-lg text-sm font-semibold border border-white/15 text-white/85 hover:bg-white/5 transition-colors"
          >
            {t("landing.mobileApp.ctaSupport")}
          </Link>
        </div>
      </article>
    </LandingPageShell>
  );
}
