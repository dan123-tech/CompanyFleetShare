"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { apiLogout } from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";
import FleetShareBrandBlock from "@/components/FleetShareBrandBlock";
export function NavSection({ children }) {
  return <div className="pt-3 pb-1 px-3 first:pt-2">{children}</div>;
}

export function NavLabel({ children }) {
  return (
    <div
      className="px-2 mb-1 font-semibold"
      style={{
        fontSize: "10px",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.25)",
      }}
    >
      {children}
    </div>
  );
}

export function Sidebar({ user, children, mobileOpen, onClose, viewAs, setViewAs }) {
  const router = useRouter();
  const { t } = useI18n();
  const showViewToggle = viewAs != null && setViewAs != null;
  const roleLabel = user?.role === "ADMIN" ? t("sidebar.administrator") : t("sidebar.member");
  const initial = (user?.name || user?.email || "U").charAt(0).toUpperCase();

  async function handleLogout() {
    await apiLogout();
    router.push("/login");
    router.refresh();
  }

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          onClick={onClose}
          className="fixed inset-0 bg-black/60 z-[135] md:hidden backdrop-blur-sm touch-manipulation"
          aria-label={t("sidebar.closeMenu")}
        />
      )}

      <aside
        className={`
          fleet-sidebar
          w-[min(280px,85vw)] min-w-0 max-w-[85vw] md:w-[240px] md:min-w-[240px] md:max-w-none
          h-[100dvh] md:h-screen flex flex-col pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] md:pb-3 text-white shrink-0 overflow-x-hidden
          fixed md:relative left-0 top-0 z-[140] md:z-auto
          transform transition-transform duration-200 ease-out touch-pan-y
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
        style={{
          backgroundColor: "var(--sidebar-bg)",
          borderRight: "1px solid var(--sidebar-border)",
        }}
      >
        {/* ── Brand header */}
        <div
          className="shrink-0 px-4 py-4 min-w-0"
          style={{ borderBottom: "1px solid var(--sidebar-border)" }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 pr-1">
              <FleetShareBrandBlock tone="dark" size="sm" className="pr-0" />
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="md:hidden p-2 -m-1 rounded-lg text-white/60 hover:bg-white/10 hover:text-white min-h-[40px] min-w-[40px] flex items-center justify-center transition-colors shrink-0"
                aria-label={t("sidebar.closeMenu")}
              >
                ✕
              </button>
            )}
          </div>

          {/* View toggle (admin only) */}
          {showViewToggle && (
            <div className="mt-4">
              <p
                className="mb-1.5 px-0.5"
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.25)",
                }}
              >
                {t("sidebar.viewAs")}
              </p>
              <div
                className="flex rounded-lg p-0.5"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                role="tablist"
                aria-label={t("sidebar.viewAs")}
              >
                {[
                  { id: "user", label: t("sidebar.viewUser") },
                  { id: "admin", label: t("sidebar.viewAdmin") },
                ].map(({ id: v, label }) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={viewAs === v}
                    onClick={() => {
                      setViewAs(v);
                      onClose?.();
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold transition-all ${
                      viewAs === v
                        ? v === "admin"
                          ? "bg-blue-900 text-white shadow-sm"
                          : "bg-blue-100 text-blue-900 shadow-sm"
                        : "text-white/40 hover:text-white/65"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 min-w-0 flex flex-col py-1">
          {children}
        </nav>

        {/* ── User footer */}
        <div
          className="shrink-0 pt-2 px-3 min-w-0"
          style={{ borderTop: "1px solid var(--sidebar-border)" }}
        >
          <div
            className="flex items-center gap-2.5 px-2 py-2 rounded-lg"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0"
              style={{ backgroundColor: "var(--brand-icon-bg)", color: "var(--brand-icon-fg)" }}
            >
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-white/90 truncate leading-tight">
                {user?.name || t("common.user")}
              </p>
              <p className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.35)" }}>
                {roleLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2 py-1.5 md:px-1.5 md:py-1.5 rounded-md transition-colors shrink-0 min-h-[40px] md:min-h-0"
              style={{ color: "rgba(255,255,255,0.35)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#fca5a5";
                e.currentTarget.style.background = "rgba(220,38,38,0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgba(255,255,255,0.35)";
                e.currentTarget.style.background = "transparent";
              }}
              title={t("sidebar.logout")}
              aria-label={t("sidebar.logout")}
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11px] font-semibold md:hidden">{t("sidebar.logout")}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export function NavItem({ active, onClick, icon, label, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2.5 w-full min-w-0 min-h-[38px] mx-2 px-2.5 py-2 rounded-lg text-left text-[13px] transition-all duration-100 cursor-pointer mb-0.5 group ${active ? "sidebar-nav-item-active" : ""}`}
      style={
        active
          ? {
              backgroundColor: "var(--sidebar-nav-active-bg)",
              color: "var(--sidebar-nav-active-text)",
              fontWeight: 600,
            }
          : {
              color: "var(--sidebar-nav-muted)",
              fontWeight: 400,
            }
      }
    >
      <span
        className="shrink-0 flex items-center justify-center w-[15px] h-[15px]"
        style={{ color: active ? "var(--sidebar-nav-active-text)" : "rgba(255,255,255,0.3)" }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="truncate flex-1">{label}</span>
      {badge != null && (
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
          style={{ background: "rgba(239,68,68,0.2)", color: "#fca5a5" }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
