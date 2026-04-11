"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiSession } from "@/lib/api";
import NoCompanyView from "@/components/dashboard/NoCompanyView";
import UserDashboard from "@/components/dashboard/UserDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import InAppNotificationPoller from "@/components/dashboard/InAppNotificationPoller";
import WebSessionLiveGuard from "@/components/dashboard/WebSessionLiveGuard";
import WebIdleLogout from "@/components/dashboard/WebIdleLogout";
import MustChangePasswordOverlay from "@/components/dashboard/MustChangePasswordOverlay";
import { useI18n } from "@/i18n/I18nProvider";

export default function DashboardPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadSession() {
    try {
      const data = await apiSession();
      if (!data) {
        router.push("/login");
        return;
      }
      setSession(data.user);
      setCompany(data.company);
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSession();
  }, []);

  return (
    <>
      <WebSessionLiveGuard />
      <WebIdleLogout />
      {loading ? (
        <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--main-bg)" }}>
          <p className="text-slate-500">{t("common.loading")}</p>
        </div>
      ) : !session ? null : session.mustChangePassword ? (
        <MustChangePasswordOverlay
          onSuccess={async () => {
            await loadSession();
          }}
        />
      ) : (
        <DashboardContent session={session} company={company} loadSession={loadSession} />
      )}
    </>
  );
}

function DashboardContent({ session, company, loadSession }) {
  const notificationShell = (
    <InAppNotificationPoller userId={session.id} initialLicenceStatus={session.drivingLicenceStatus} />
  );

  if (!company) {
    return (
      <>
        {notificationShell}
        <div className="min-h-screen" style={{ background: "var(--main-bg)" }}>
          <NoCompanyView onJoined={loadSession} />
        </div>
      </>
    );
  }

  if (session.role === "ADMIN") {
    return (
      <>
        {notificationShell}
        <AdminDashboardOrUserToggle session={session} company={company} loadSession={loadSession} />
      </>
    );
  }

  return (
    <>
      {notificationShell}
      <div className="h-screen w-full flex overflow-hidden" style={{ background: "var(--main-bg)" }}>
        <UserDashboard user={session} company={company} onUserUpdated={loadSession} />
      </div>
    </>
  );
}

function AdminDashboardOrUserToggle({ session, company, loadSession }) {
  const [viewAs, setViewAs] = useState("admin"); // "admin" | "user"

  return (
    <div className="h-screen w-full flex overflow-hidden" style={{ background: "var(--main-bg)" }}>
      <div className="flex-1 flex min-h-0 min-w-0">
        {viewAs === "user" ? (
          <UserDashboard
            user={session}
            company={company}
            onUserUpdated={loadSession}
            viewAs={viewAs}
            setViewAs={setViewAs}
          />
        ) : (
          <AdminDashboard
            user={session}
            company={company}
            onCompanyUpdated={loadSession}
            viewAs={viewAs}
            setViewAs={setViewAs}
          />
        )}
      </div>
    </div>
  );
}
