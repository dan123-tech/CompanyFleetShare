"use client";

import Link from "next/link";
import { Download, MonitorSmartphone, Server, Sparkles } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

const COL = { base: "#0c1220", primary: "#185fa5", accent: "#f5a623" };

const codeClass = "text-[11px] sm:text-xs font-mono rounded px-1 py-0.5 bg-white/10 text-white/85";

/** Served from public/downloads/fleetshare.apk — override with full URL if hosted elsewhere. */
const DEFAULT_ANDROID_APK_PATH = "/downloads/fleetshare.apk";

function getAndroidDownloadHref() {
  const env =
    typeof process.env.NEXT_PUBLIC_ANDROID_DOWNLOAD_URL === "string"
      ? process.env.NEXT_PUBLIC_ANDROID_DOWNLOAD_URL.trim()
      : "";
  return env || DEFAULT_ANDROID_APK_PATH;
}

function isSameOriginApkPath(href) {
  return href.startsWith("/") && !href.startsWith("//");
}

export default function DownloadPageClient() {
  const { t } = useI18n();
  const androidHref = getAndroidDownloadHref();

  return (
    <div className="min-h-screen" style={{ background: COL.base }}>
      <header
        className="border-b"
        style={{
          borderColor: "rgba(255,255,255,0.07)",
          background: "rgba(12, 18, 32, 0.92)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-5 py-3">
          <Link
            href="/"
            className="text-[13px] font-medium transition-colors hover:text-white/90"
            style={{ color: "rgba(255,255,255,0.72)" }}
          >
            {t("landing.download.backHome")}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-5 py-10 sm:py-12">
        <h1
          className="text-2xl sm:text-3xl font-bold text-white mb-1"
          style={{ letterSpacing: "-0.03em" }}
        >
          {t("landing.download.pageTitle")}
        </h1>
        <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.45)" }}>
          {t("landing.download.pageSubtitle")}
        </p>
        <p className="text-sm leading-relaxed mb-10" style={{ color: "rgba(255,255,255,0.55)" }}>
          {t("landing.download.intro")}
        </p>

        <section className="space-y-10">
          <div
            className="rounded-2xl p-5 sm:p-6"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex items-start gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: "rgba(24, 95, 165, 0.22)",
                  border: "1px solid rgba(24, 95, 165, 0.4)",
                }}
              >
                <MonitorSmartphone className="w-5 h-5" style={{ color: "#7ec0ea" }} strokeWidth={1.6} />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-white mb-2">{t("landing.download.webTitle")}</h2>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {t("landing.download.webBody")}
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Link
                    href="/register"
                    className="inline-flex items-center justify-center h-10 px-4 rounded-xl text-white text-sm font-semibold bg-[#185fa5] hover:bg-[#1d4ed8] transition-colors"
                  >
                    {t("landing.getStarted")}
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center h-10 px-4 rounded-xl text-sm font-semibold transition-colors border border-white/15 text-white/80 hover:border-white/25 hover:bg-white/5"
                  >
                    {t("landing.signIn")}
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
          <section
            id="company-server"
            className="rounded-2xl p-5 sm:p-6 scroll-mt-24"
            style={{
              background: "rgba(245, 166, 35, 0.08)",
              border: "1px solid rgba(245, 166, 35, 0.32)",
            }}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: "rgba(245, 166, 35, 0.16)",
                  border: "1px solid rgba(245, 166, 35, 0.4)",
                }}
              >
                <Server className="w-5 h-5" style={{ color: COL.accent }} strokeWidth={1.6} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold mb-2" style={{ color: COL.accent }}>
                  {t("landing.download.fullServerTitle")}
                </h2>
                <p className="text-sm leading-relaxed mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {t("landing.download.fullServerBody")}
                </p>
                <p className="text-xs leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.38)" }}>
                  {t("landing.download.fullServerDeepLink")}
                </p>
                <p className="text-xs leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {t("landing.download.fullServerDownloadsHint")}
                </p>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                  <a
                    href="/downloads/fleetshare-full-server-install.sh"
                    download="fleetshare-full-server-install.sh"
                    className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold transition-colors bg-[#f5a623] text-[#0c1220] hover:bg-[#ffc34d]"
                  >
                    <Download className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden />
                    {t("landing.download.fullServerDownloadPrimary")}
                  </a>
                  <a
                    href="/downloads/fleetshare-full-server-install.ps1"
                    download="fleetshare-full-server-install.ps1"
                    className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold transition-colors border border-[#f5a623]/65 text-[#f5a623] hover:bg-[#f5a623]/12"
                  >
                    <Download className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden />
                    {t("landing.download.fullServerDownloadWindows")}
                  </a>
                  <a
                    href="/downloads/fleetshare-full-server-commands.txt"
                    download="fleetshare-full-server-commands.txt"
                    className="inline-flex items-center justify-center h-11 px-5 rounded-xl text-sm font-semibold transition-colors border border-white/20 text-white/85 hover:bg-white/5"
                  >
                    {t("landing.download.fullServerDownloadTxt")}
                  </a>
                </div>
                <p className="text-xs leading-relaxed mt-4" style={{ color: "rgba(255,255,255,0.38)" }}>
                  {t("landing.download.fullServerRunHint")}
                </p>
              </div>
            </div>

            <h3
              className="text-[11px] font-semibold uppercase tracking-wide mb-3"
              style={{ color: "rgba(255,255,255,0.38)" }}
            >
              {t("landing.download.fullServerAfterTitle")}
            </h3>
            <ul className="list-disc pl-5 text-sm space-y-2" style={{ color: "rgba(255,255,255,0.55)" }}>
              <li>{t("landing.download.fullServerAfter1")}</li>
              <li>{t("landing.download.fullServerAfter2")}</li>
              <li>{t("landing.download.fullServerAfter3")}</li>
              <li>{t("landing.download.fullServerAfter4")}</li>
            </ul>
          </section>

          <section
            id="ai-validator"
            className="rounded-2xl p-5 sm:p-6 scroll-mt-24"
            style={{
              background: "rgba(245, 166, 35, 0.08)",
              border: "1px solid rgba(245, 166, 35, 0.32)",
            }}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: "rgba(245, 166, 35, 0.16)",
                  border: "1px solid rgba(245, 166, 35, 0.4)",
                }}
              >
                <Sparkles className="w-5 h-5" style={{ color: COL.accent }} strokeWidth={1.6} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold mb-2" style={{ color: COL.accent }}>
                  {t("landing.download.aiValidatorTitle")}
                </h2>
                <p className="text-sm leading-relaxed mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {t("landing.download.aiValidatorIntro")}
                </p>
                <p className="text-xs leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.38)" }}>
                  {t("landing.download.aiValidatorDeepLink")}
                </p>
                <p className="text-xs leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {t("landing.download.aiValidatorDownloadsHint")}
                </p>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                  <a
                    href="/downloads/fleetshare-ai-validator-install.sh"
                    download="fleetshare-ai-validator-install.sh"
                    className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold transition-colors bg-[#f5a623] text-[#0c1220] hover:bg-[#ffc34d]"
                  >
                    <Download className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden />
                    {t("landing.download.aiValidatorDownloadPrimary")}
                  </a>
                  <a
                    href="/downloads/fleetshare-ai-validator-install.ps1"
                    download="fleetshare-ai-validator-install.ps1"
                    className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold transition-colors border border-[#f5a623]/65 text-[#f5a623] hover:bg-[#f5a623]/12"
                  >
                    <Download className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden />
                    {t("landing.download.aiValidatorDownloadWindows")}
                  </a>
                  <a
                    href="/downloads/fleetshare-ai-validator-commands.txt"
                    download="fleetshare-ai-validator-commands.txt"
                    className="inline-flex items-center justify-center h-11 px-5 rounded-xl text-sm font-semibold transition-colors border border-white/20 text-white/85 hover:bg-white/5"
                  >
                    {t("landing.download.aiValidatorDownloadTxt")}
                  </a>
                </div>
                <p className="text-xs leading-relaxed mt-4" style={{ color: "rgba(255,255,255,0.38)" }}>
                  {t("landing.download.aiValidatorRunHint")}
                </p>
              </div>
            </div>

            <h3
              className="text-[11px] font-semibold uppercase tracking-wide mb-3"
              style={{ color: "rgba(255,255,255,0.38)" }}
            >
              {t("landing.download.aiValidatorAfterTitle")}
            </h3>
            <ul className="list-disc pl-5 text-sm space-y-2 mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>
              <li>{t("landing.download.aiValidatorAfter1")}</li>
              <li>{t("landing.download.aiValidatorAfter2")}</li>
              <li>{t("landing.download.aiValidatorAfter3")}</li>
              <li>{t("landing.download.aiValidatorAfter4")}</li>
            </ul>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.38)" }}>
              {t("landing.download.aiValidatorHealth")}{" "}
              <code className={codeClass}>curl http://localhost:8080/health</code>
            </p>
          </section>
          </div>

          <div
            className="rounded-2xl p-5 sm:p-6"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex items-start gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: "rgba(245, 166, 35, 0.12)",
                  border: "1px solid rgba(245, 166, 35, 0.35)",
                }}
              >
                <Download className="w-5 h-5" style={{ color: COL.accent }} strokeWidth={1.6} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold mb-2" style={{ color: COL.accent }}>
                  {t("landing.download.androidTitle")}
                </h2>
                <p className="text-sm leading-relaxed mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {t("landing.download.androidBody")}
                </p>
                <p className="text-xs leading-relaxed mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {t("landing.download.apkFileHint")}
                </p>
                <p className="text-xs leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {t("landing.download.apkInstallSteps")}
                </p>
                <a
                  href={androidHref}
                  {...(!isSameOriginApkPath(androidHref)
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-white text-sm font-semibold bg-[#185fa5] hover:bg-[#1d4ed8] transition-colors"
                >
                  <Download className="w-4 h-4 shrink-0" strokeWidth={2} />
                  {t("landing.download.directCta")}
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
