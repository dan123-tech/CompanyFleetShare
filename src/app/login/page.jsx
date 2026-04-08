"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, AlertCircle, Eye, EyeOff } from "lucide-react";
import { apiLogin, apiVerifyMfaLogin } from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";
import LanguageCurrencySwitcher from "@/components/LanguageCurrencySwitcher";
import FleetShareBrandBlock from "@/components/FleetShareBrandBlock";

function maskEmail(em) {
  const s = String(em || "").trim();
  const at = s.indexOf("@");
  if (at < 1) return s;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  const show = local.slice(0, 2);
  return `${show}•••@${domain}`;
}

export default function LoginPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mfaStep, setMfaStep] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await apiLogin(email, password);
      if (result?.mfaRequired) {
        setMfaStep(true);
        setPendingEmail(result.email || email);
        setMfaCode("");
        return;
      }
      window.location.assign("/dashboard");
    } catch (err) {
      setError(err.message || t("login.errorFallback"));
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiVerifyMfaLogin(pendingEmail, mfaCode.trim());
      window.location.assign("/dashboard");
    } catch (err) {
      setError(err.message || t("login.errorFallback"));
    } finally {
      setLoading(false);
    }
  }

  function handleMfaBack() {
    setMfaStep(false);
    setMfaCode("");
    setPendingEmail("");
    setError("");
  }

  return (
    <div
      className="min-h-screen flex"
      style={{ background: "var(--main-bg)" }}
    >
      {/* ── Left panel (branding) */}
      <div
        className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-col justify-between p-10 shrink-0"
        style={{ background: "var(--sidebar-bg)" }}
      >
        <FleetShareBrandBlock tone="dark" size="xl" priority className="max-w-full" />

        {/* Central content */}
        <div>
          <h2
            className="text-4xl font-bold leading-tight mb-4"
            style={{ letterSpacing: "-0.04em" }}
          >
            <span style={{ color: "#f5a623" }}>{t("landing.branding.fleetSmarterAccent")}</span>
            <span className="text-white">{t("landing.branding.fleetSmarterLine1Rest")}</span>
            <br />
            <span className="text-white">{t("landing.branding.fleetSmarterLine2")}</span>
          </h2>
          <p className="text-base" style={{ color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
            {t("landing.branding.fleetSmarterSub")}
          </p>

          {/* Feature list */}
          <div className="mt-8 space-y-3">
            {[
              t("landing.branding.bullet1"),
              t("landing.branding.bullet2"),
              t("landing.branding.bullet3"),
            ].map((f) => (
              <div key={f} className="flex items-center gap-3">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "rgba(29,78,216,0.35)", border: "1px solid rgba(29,78,216,0.5)" }}
                >
                  <svg className="w-2.5 h-2.5 text-blue-300" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
          {t("common.copyright")}
        </p>
      </div>

      {/* ── Right panel (form) */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          <div className="flex justify-end mb-4">
            <LanguageCurrencySwitcher variant="light" />
          </div>
          <div className="lg:hidden mb-8">
            <FleetShareBrandBlock tone="light" size="md" className="max-w-full" />
          </div>

          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "var(--text)", letterSpacing: "-0.03em" }}
          >
            {mfaStep ? t("login.mfaTitle") : t("login.title")}
          </h1>
          <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
            {mfaStep
              ? t("login.mfaSubtitle", { email: maskEmail(pendingEmail) })
              : t("login.subtitle")}
          </p>

          {error && (
            <div className="mb-5 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-100 text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {!mfaStep ? (
            <form method="post" onSubmit={handlePasswordSubmit} className="space-y-4" autoComplete="on">
              <div>
                <label
                  className="block text-[13px] font-semibold mb-1.5"
                  style={{ color: "var(--text)" }}
                >
                  {t("login.email")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all duration-150"
                  style={{
                    border: "1px solid rgba(15,23,42,0.14)",
                    color: "var(--text)",
                    background: "#fff",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--primary)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px var(--primary-ring)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(15,23,42,0.14)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  placeholder="you@company.com"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    className="block text-[13px] font-semibold"
                    style={{ color: "var(--text)" }}
                  >
                    {t("login.password")}
                  </label>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 pr-11 py-2.5 text-sm rounded-xl outline-none transition-all duration-150"
                    style={{
                      border: "1px solid rgba(15,23,42,0.14)",
                      color: "var(--text)",
                      background: "#fff",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--primary)";
                      e.currentTarget.style.boxShadow = "0 0 0 3px var(--primary-ring)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "rgba(15,23,42,0.14)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm text-white font-semibold rounded-xl transition-all duration-150 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "var(--primary)",
                  boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.08)",
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = "var(--primary-hover)";
                    e.currentTarget.style.transform = "translateY(-0.5px)";
                    e.currentTarget.style.boxShadow = "0 4px 12px -2px rgb(29 78 216 / 0.3)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--primary)";
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = "0 1px 2px 0 rgb(0 0 0 / 0.08)";
                }}
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t("login.submitting")}
                  </>
                ) : (
                  <>
                    {t("login.submit")}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form method="post" onSubmit={handleMfaSubmit} className="space-y-4" autoComplete="on">
              <div>
                <label
                  className="block text-[13px] font-semibold mb-1.5"
                  style={{ color: "var(--text)" }}
                >
                  {t("login.mfaCode")}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all duration-150 tracking-widest font-mono text-lg"
                  style={{
                    border: "1px solid rgba(15,23,42,0.14)",
                    color: "var(--text)",
                    background: "#fff",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--primary)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px var(--primary-ring)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(15,23,42,0.14)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  placeholder="000000"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading || mfaCode.length !== 6}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm text-white font-semibold rounded-xl transition-all duration-150 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "var(--primary)",
                  boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.08)",
                }}
              >
                {loading ? t("login.mfaVerifying") : t("login.mfaVerify")}
              </button>
              <button
                type="button"
                onClick={handleMfaBack}
                className="w-full py-2.5 text-sm font-medium rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {t("login.mfaBack")}
              </button>
            </form>
          )}

          {!mfaStep && (
            <p className="mt-6 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
              {t("login.noAccount")}{" "}
              <Link
                href="/register"
                className="font-semibold hover:underline"
                style={{ color: "var(--primary)" }}
              >
                {t("login.createOne")}
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
