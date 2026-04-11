"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import LandingSiteHeader from "@/components/landing/LandingSiteHeader";
import LandingSiteFooter from "@/components/landing/LandingSiteFooter";
import { useI18n } from "@/i18n/I18nProvider";

const SUBMIT_COLOR = "#512DA8";

function OutlinedField({ id, label, type = "text", value, onChange, as, rows }) {
  const common =
    "w-full rounded-md border border-neutral-300 bg-white px-3 pt-3 pb-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-[#512DA8] focus:ring-1 focus:ring-[#512DA8]";
  if (as === "textarea") {
    return (
      <div className="relative">
        <label htmlFor={id} className="absolute -top-2.5 left-3 z-[1] bg-white px-1 text-xs font-medium text-neutral-600">
          {label}
        </label>
        <textarea
          id={id}
          name={id}
          rows={rows || 5}
          className={common}
          placeholder={label}
          value={value}
          onChange={onChange}
          required
        />
      </div>
    );
  }
  return (
    <div className="relative">
      <label htmlFor={id} className="absolute -top-2.5 left-3 z-[1] bg-white px-1 text-xs font-medium text-neutral-600">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        className={common}
        placeholder={label}
        value={value}
        onChange={onChange}
        required
      />
    </div>
  );
}

export default function ContactPageClient() {
  const { t, locale } = useI18n();
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [scriptReady, setScriptReady] = useState(false);
  const [widgetId, setWidgetId] = useState(null);
  const recaptchaHostRef = useRef(null);

  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!siteKey || !scriptReady || !recaptchaHostRef.current) return;
    if (typeof window === "undefined" || !window.grecaptcha?.ready) return;
    const el = recaptchaHostRef.current;
    window.grecaptcha.ready(() => {
      if (!el || el.querySelector("iframe")) return;
      const id = window.grecaptcha.render(el, { sitekey: siteKey });
      setWidgetId(id);
    });
  }, [siteKey, scriptReady]);

  const onSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setErrorMsg("");
      if (!siteKey) return;

      let recaptchaToken = "";
      if (widgetId != null && typeof window !== "undefined" && window.grecaptcha) {
        recaptchaToken = window.grecaptcha.getResponse(widgetId) || "";
      }
      if (!recaptchaToken) {
        setErrorMsg(t("landing.contactForm.errorCaptcha"));
        return;
      }

      setStatus("sending");
      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName,
            lastName,
            email,
            message,
            recaptchaToken,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data.error === "inbox_not_configured" || data.error === "email_not_configured") {
            setErrorMsg(t("landing.contactForm.errorConfig"));
          } else {
            setErrorMsg(t("landing.contactForm.errorGeneric"));
          }
          setStatus("idle");
          return;
        }
        setStatus("success");
        setFirstName("");
        setLastName("");
        setEmail("");
        setMessage("");
        if (widgetId != null && window.grecaptcha) {
          window.grecaptcha.reset(widgetId);
        }
      } catch {
        setErrorMsg(t("landing.contactForm.errorGeneric"));
        setStatus("idle");
      }
    },
    [siteKey, widgetId, firstName, lastName, email, message, t]
  );

  const recaptchaSrc = `https://www.google.com/recaptcha/api.js?hl=${locale === "ro" ? "ro" : "en"}`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0c1220" }}>
      <Script src={recaptchaSrc} strategy="lazyOnload" onLoad={() => setScriptReady(true)} />
      <LandingSiteHeader />

      <div className="flex-1 bg-slate-100 py-10 px-4">
        <div className="max-w-lg mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <h1 className="text-xl font-bold text-neutral-900 mb-1">{t("landing.contactForm.pageTitle")}</h1>
          <p className="text-sm text-neutral-600 mb-6">{t("landing.contactForm.pageSubtitle")}</p>

          {!siteKey ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">{t("landing.contactForm.captchaDisabled")}</p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <OutlinedField
                  id="contact-first"
                  label={t("landing.contactForm.firstName")}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
                <OutlinedField
                  id="contact-last"
                  label={t("landing.contactForm.lastName")}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              <OutlinedField
                id="contact-email"
                label={t("landing.contactForm.email")}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <OutlinedField
                id="contact-message"
                label={t("landing.contactForm.message")}
                as="textarea"
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />

              <div aria-label={t("landing.contactForm.recaptchaAria")}>
                <div ref={recaptchaHostRef} className="min-h-[78px]" />
              </div>

              {errorMsg ? <p className="text-sm text-red-600">{errorMsg}</p> : null}
              {status === "success" ? (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">{t("landing.contactForm.success")}</p>
              ) : null}

              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full sm:w-auto rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-60 hover:opacity-95"
                style={{ background: SUBMIT_COLOR }}
              >
                {status === "sending" ? t("landing.contactForm.sending") : t("landing.contactForm.submit")}
              </button>
            </form>
          )}

          <p className="mt-6 text-xs text-neutral-500">
            <Link href="/support" className="text-[#185fa5] font-medium hover:underline">
              {t("landing.sections.contactSupport")}
            </Link>
          </p>
        </div>
      </div>

      <LandingSiteFooter />
    </div>
  );
}
