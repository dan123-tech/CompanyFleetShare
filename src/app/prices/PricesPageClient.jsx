"use client";

import Link from "next/link";
import LandingPageShell from "@/components/landing/LandingPageShell";
import { LANDING_COL } from "@/components/landing/landingTheme";
import { useI18n } from "@/i18n/I18nProvider";

export default function PricesPageClient() {
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
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">{t("landing.pricesPage.title")}</h1>
        <p className="text-sm font-medium mb-4" style={{ color: LANDING_COL.accent }}>
          {t("landing.pricesPage.subtitle")}
        </p>
        <p className="text-sm mb-6 leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
          {t("landing.pricesPage.body")}
        </p>
        <p className="text-sm mb-8 leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
          {t("landing.pricesPage.supportLead")}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/support"
            className="inline-flex items-center justify-center h-10 px-4 rounded-lg text-sm font-semibold text-white bg-[#185fa5] hover:bg-[#1d4ed8] transition-colors"
          >
            {t("landing.pricesPage.supportCta")}
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center h-10 px-4 rounded-lg text-sm font-semibold border border-white/15 text-white/85 hover:bg-white/5 transition-colors"
          >
            {t("landing.pricesPage.contactCta")}
          </Link>
        </div>
      </article>
    </LandingPageShell>
  );
}
