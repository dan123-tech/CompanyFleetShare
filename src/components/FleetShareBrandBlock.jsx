"use client";

import { useI18n } from "@/i18n/I18nProvider";

const MARK_SRC = {
  dark: "/brand/fleetshare-mark-dark.svg",
  light: "/brand/fleetshare-mark-light.svg",
};

/** Visual scale presets — real text for tagline (readable); avoids tiny SVG text. */
const SIZES = {
  sm: { img: 60, word: "text-base", tag: "text-xs", gap: "gap-3", mtTag: "mt-1.5" },
  /** Intro / header: slightly smaller than `md`, text unchanged from user preference */
  nav: { img: 68, word: "text-lg", tag: "text-xs", gap: "gap-3", mtTag: "mt-1.5" },
  md: { img: 76, word: "text-xl", tag: "text-xs", gap: "gap-4", mtTag: "mt-2" },
  lg: { img: 92, word: "text-2xl", tag: "text-sm", gap: "gap-4", mtTag: "mt-2.5" },
  xl: { img: 108, word: "text-3xl", tag: "text-sm", gap: "gap-4", mtTag: "mt-3" },
};

/**
 * @param {"dark"|"light"} tone
 * @param {"sm"|"nav"|"md"|"lg"|"xl"} size
 * @param {boolean} [priority] — fetchPriority high for LCP (login hero)
 */
export default function FleetShareBrandBlock({
  tone = "dark",
  size = "md",
  priority = false,
  className = "",
}) {
  const { t } = useI18n();
  const s = SIZES[size] ?? SIZES.md;
  const dark = tone === "dark";
  const src = MARK_SRC[tone] ?? MARK_SRC.dark;

  return (
    <div className={`flex items-center min-w-0 ${s.gap} ${className}`.trim()}>
      <img
        src={src}
        alt=""
        width={s.img}
        height={s.img}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        aria-hidden
        className={`shrink-0 rounded-2xl ${dark ? "shadow-lg shadow-sky-950/30" : "shadow-md shadow-slate-300/80 border border-sky-100"}`}
      />
      <div className="min-w-0 flex-1">
        <p className={`${s.word} font-bold leading-[1.1] tracking-tight`}>
          <span className={dark ? "text-white" : "text-slate-900"}>Fleet</span>
          <span className={dark ? "text-sky-400" : "text-sky-600"}>Share</span>
        </p>
        <p
          className={`${s.tag} font-semibold uppercase leading-snug ${dark ? "text-slate-300" : "text-slate-600"} ${s.mtTag}`}
          style={{ letterSpacing: "0.1em" }}
        >
          {t("sidebar.logoTagline")}
        </p>
      </div>
    </div>
  );
}
