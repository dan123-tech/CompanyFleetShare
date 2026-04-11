"use client";

import Link from "next/link";
import LandingPageShell from "@/components/landing/LandingPageShell";
import { useI18n } from "@/i18n/I18nProvider";

export default function DownloadUnavailableClient() {
  const { t } = useI18n();

  return (
    <LandingPageShell>
      <div
        className="max-w-xl rounded-2xl border px-6 py-10 text-center"
        style={{
          borderColor: "rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.05)",
        }}
      >
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-3">{t("landing.download.unavailableTitle")}</h1>
        <p className="text-sm leading-relaxed mb-8" style={{ color: "rgba(255,255,255,0.55)" }}>
          {t("landing.download.unavailableBody")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/contact"
            className="inline-flex items-center justify-center h-10 px-4 rounded-lg text-sm font-semibold text-white bg-[#185fa5] hover:bg-[#1d4ed8] transition-colors"
          >
            {t("landing.download.unavailableSupport")}
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center h-10 px-4 rounded-lg text-sm font-semibold border border-white/15 text-white/85 hover:bg-white/5 transition-colors"
          >
            {t("landing.download.backHome")}
          </Link>
        </div>
      </div>
    </LandingPageShell>
  );
}
