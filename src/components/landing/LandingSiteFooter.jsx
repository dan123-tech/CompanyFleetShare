"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";

export default function LandingSiteFooter() {
  const { t } = useI18n();

  return (
    <div
      className="pb-8 text-center border-t pt-6 max-w-6xl mx-auto px-4 sm:px-5"
      style={{ borderColor: "rgba(255,255,255,0.07)" }}
    >
      <div
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs"
        style={{ color: "rgba(255,255,255,0.25)" }}
      >
        <span>{t("common.copyright")}</span>
        <span aria-hidden>·</span>
        <Link href="/privacy" className="hover:underline text-[#185fa5] hover:text-[#1d4ed8] transition-colors">
          {t("landing.footer.privacy")}
        </Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className="hover:underline text-[#185fa5] hover:text-[#1d4ed8] transition-colors">
          {t("landing.footer.terms")}
        </Link>
        <span aria-hidden>·</span>
        <Link href="/support" className="hover:underline text-[#185fa5] hover:text-[#1d4ed8] transition-colors">
          {t("landing.footer.support")}
        </Link>
        <span aria-hidden>·</span>
        <Link href="/cookies" className="hover:underline text-[#185fa5] hover:text-[#1d4ed8] transition-colors">
          {t("landing.footer.cookies")}
        </Link>
      </div>
    </div>
  );
}
