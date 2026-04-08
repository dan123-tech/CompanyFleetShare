"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { apiChangePassword } from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";

/**
 * Blocks the dashboard until the user sets a new password (admin-provisioned accounts).
 */
export default function MustChangePasswordOverlay({ onSuccess }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (next.length < 8) {
      setError(t("register.passwordRule"));
      return;
    }
    if (next !== confirm) {
      setError(t("forcedPasswordChange.mismatch"));
      return;
    }
    setSaving(true);
    try {
      await apiChangePassword(current, next);
      await onSuccess?.();
    } catch (err) {
      setError(err?.message || t("forcedPasswordChange.errorFallback"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(15, 23, 42, 0.65)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="forced-pw-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        style={{ boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}
      >
        <h2 id="forced-pw-title" className="text-lg font-semibold text-slate-900">
          {t("forcedPasswordChange.title")}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{t("forcedPasswordChange.body")}</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t("forcedPasswordChange.current")}</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="w-full px-3 pr-10 py-2 border border-slate-200 rounded-xl focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700"
                aria-label={showCurrent ? "Hide current password" : "Show current password"}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t("forcedPasswordChange.new")}</label>
            <div className="relative">
              <input
                type={showNext ? "text" : "password"}
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="w-full px-3 pr-10 py-2 border border-slate-200 rounded-xl focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowNext((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700"
                aria-label={showNext ? "Hide new password" : "Show new password"}
              >
                {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t("forcedPasswordChange.confirm")}</label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-3 pr-10 py-2 border border-slate-200 rounded-xl focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring)] outline-none"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700"
                aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl font-semibold text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-60 transition-colors"
          >
            {saving ? t("forcedPasswordChange.submitting") : t("forcedPasswordChange.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
