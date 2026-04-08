"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, AlertCircle, Eye, EyeOff } from "lucide-react";
import { apiRegister } from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";
import LanguageCurrencySwitcher from "@/components/LanguageCurrencySwitcher";
import FleetShareBrandBlock from "@/components/FleetShareBrandBlock";

export default function RegisterPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError(t("register.passwordRule"));
      return;
    }
    setLoading(true);
    try {
      await apiRegister(email, password, name);
      router.push("/login");
      router.refresh();
    } catch (err) {
      setError(err.message || t("register.errorFallback"));
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    border: "1px solid rgba(15,23,42,0.14)",
    color: "var(--text)",
    background: "#fff",
  };
  const focusIn = (e) => {
    e.currentTarget.style.borderColor = "var(--primary)";
    e.currentTarget.style.boxShadow = "0 0 0 3px var(--primary-ring)";
  };
  const focusOut = (e) => {
    e.currentTarget.style.borderColor = "rgba(15,23,42,0.14)";
    e.currentTarget.style.boxShadow = "none";
  };

  return (
    <div className="min-h-screen flex" style={{ background: "var(--main-bg)" }}>
      {/* ── Left branding panel */}
      <div
        className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-col justify-between p-10 shrink-0"
        style={{ background: "var(--sidebar-bg)" }}
      >
        <FleetShareBrandBlock tone="dark" size="xl" priority className="max-w-full" />

        <div>
          <h2
            className="text-4xl font-bold leading-tight mb-4"
            style={{ letterSpacing: "-0.04em" }}
          >
            <span className="text-white">{t("register.heroLine1Before")}</span>
            <span style={{ color: "#f5a623" }}>{t("register.heroLine1Accent")}</span>
            <br />
            <span className="text-white">{t("register.heroLine2")}</span>
          </h2>
          <p className="text-base" style={{ color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
            {t("register.heroSub")}
          </p>

          <div className="mt-8 p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-sm font-semibold mb-1">
              <span style={{ color: "#f5a623" }}>{t("register.quickSetupAccent")}</span>
              <span className="text-white">{t("register.quickSetupTitleRest")}</span>
            </p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
              {t("register.quickSetupBody")}
            </p>
          </div>
        </div>

        <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
          {t("common.copyright")}
        </p>
      </div>

      {/* ── Right form panel */}
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
            {t("register.title")}
          </h1>
          <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
            {t("register.subtitle")}
          </p>

          {error && (
            <div className="mb-5 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-100 text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <form method="post" onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
            <div>
              <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "var(--text)" }}>
                {t("register.name")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all duration-150"
                style={inputStyle}
                onFocus={focusIn}
                onBlur={focusOut}
                placeholder="John Doe"
                required
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "var(--text)" }}>
                {t("register.email")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all duration-150"
                style={inputStyle}
                onFocus={focusIn}
                onBlur={focusOut}
                placeholder="you@company.com"
                required
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "var(--text)" }}>
                {t("register.password")}
                <span className="font-normal ml-1" style={{ color: "var(--text-muted)" }}>{t("register.passwordMinSuffix")}</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 pr-11 py-2.5 text-sm rounded-xl outline-none transition-all duration-150"
                  style={inputStyle}
                  onFocus={focusIn}
                  onBlur={focusOut}
                  placeholder="••••••••"
                  required
                  minLength={8}
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
              style={{ background: "var(--primary)", boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.08)" }}
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
                  {t("register.submitting")}
                </>
              ) : (
                <>
                  {t("register.submit")}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            {t("register.hasAccount")}{" "}
            <Link href="/login" className="font-semibold hover:underline" style={{ color: "var(--primary)" }}>
              {t("register.signIn")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
