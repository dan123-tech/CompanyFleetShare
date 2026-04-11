"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import LanguageCurrencySwitcher from "@/components/LanguageCurrencySwitcher";
import FleetShareBrandBlock from "@/components/FleetShareBrandBlock";

const navLinkClass =
  "text-[13px] font-medium px-2.5 py-2 rounded-lg transition-colors hover:text-white/90 hover:bg-white/5 outline-none focus-visible:ring-2 focus-visible:ring-[#185fa5]/60";
const navMuted = { color: "rgba(255,255,255,0.72)" };

function closeDetails(el) {
  const d = el?.closest?.("details");
  if (d) d.open = false;
}

export default function LandingSiteHeader({ logoPriority = false }) {
  const { t } = useI18n();

  return (
    <header
      className="border-b sticky top-0 z-20"
      style={{
        borderColor: "rgba(255,255,255,0.07)",
        background: "rgba(12, 18, 32, 0.92)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-5 py-3 sm:py-3.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href="/" className="flex items-center min-w-0 shrink-0 hover:opacity-90 transition-opacity">
          <FleetShareBrandBlock
            tone="dark"
            size="nav"
            priority={logoPriority}
            className="max-w-[min(260px,70vw)] sm:max-w-[min(300px,82vw)]"
          />
        </Link>

        <nav
          className="flex flex-1 min-w-0 flex-wrap items-center gap-x-0.5 gap-y-1 sm:gap-x-1"
          aria-label="Primary"
        >
          <Link href="/" className={navLinkClass} style={navMuted}>
            {t("landing.nav.home")}
          </Link>
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
              <Link
                href="/register"
                className="block px-3 py-2.5 transition-colors hover:bg-white/5"
                style={navMuted}
                onClick={(e) => closeDetails(e.currentTarget)}
              >
                <span className="block text-[13px] font-semibold text-white/90">{t("landing.nav.webTitle")}</span>
                <span className="block text-[11px] mt-0.5 opacity-70">{t("landing.nav.webSub")}</span>
              </Link>
              <Link
                href="/products/mobile"
                className="block px-3 py-2.5 transition-colors hover:bg-white/5 border-t border-white/10"
                style={navMuted}
                onClick={(e) => closeDetails(e.currentTarget)}
              >
                <span className="block text-[13px] font-semibold text-white/90">{t("landing.nav.mobileTitle")}</span>
                <span className="block text-[11px] mt-0.5 opacity-70">{t("landing.nav.mobileSub")}</span>
              </Link>
            </div>
          </details>
          <Link href="/prices" className={navLinkClass} style={navMuted}>
            {t("landing.nav.prices")}
          </Link>
          <Link href="/contact" className={navLinkClass} style={navMuted}>
            {t("landing.nav.contact")}
          </Link>
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
  );
}
