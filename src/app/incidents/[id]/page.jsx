"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiIncidentGet } from "@/lib/api";

function isImageAttachment(a) {
  const ct = String(a?.contentType || "").toLowerCase();
  return ct.startsWith("image/");
}

export default function IncidentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [incident, setIncident] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    apiIncidentGet(id)
      .then((row) => {
        if (!alive) return;
        setIncident(row);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.message || "Failed to load incident");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const title = useMemo(() => {
    if (!incident) return "Incident report";
    const car = [incident.car?.brand, incident.car?.registrationNumber].filter(Boolean).join(" ");
    return `${incident.title || "Incident"}${car ? ` — ${car}` : ""}`;
  }, [incident]);

  return (
    <div className="min-h-screen" style={{ background: "var(--main-bg)" }}>
      <div className="max-w-4xl mx-auto p-5 sm:p-8 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{title}</h1>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50"
          >
            Back to dashboard
          </button>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6">
            <p className="text-slate-500">Loading…</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-red-200 shadow-sm p-6">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        ) : !incident ? null : (
          <>
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Gravity</p>
                  <p className="text-sm font-bold text-slate-900">{(incident.severity || "C").toUpperCase()}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Status</p>
                  <p className="text-sm font-bold text-slate-900">{incident.status || "SUBMITTED"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Occurred</p>
                  <p className="text-sm text-slate-800">
                    {incident.occurredAt ? new Date(incident.occurredAt).toLocaleString() : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Car</p>
                  <p className="text-sm text-slate-800">
                    {[incident.car?.brand, incident.car?.model, incident.car?.registrationNumber].filter(Boolean).join(" ") || "—"}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold text-slate-500">Driver</p>
                  <p className="text-sm text-slate-800">{incident.user?.email || incident.userId || "—"}</p>
                </div>
                {incident.location ? (
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold text-slate-500">Location</p>
                    <p className="text-sm text-slate-800">{incident.location}</p>
                  </div>
                ) : null}
                {incident.description ? (
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold text-slate-500">Description</p>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{incident.description}</p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">Attachments</h2>
              {(incident.attachments || []).length === 0 ? (
                <p className="text-sm text-slate-500">No attachments.</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(incident.attachments || [])
                      .filter((a) => isImageAttachment(a))
                      .map((a) => (
                        <a
                          key={a.id}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="block rounded-xl border border-slate-200 overflow-hidden bg-slate-50 hover:bg-slate-100 transition-colors"
                          title={a.filename}
                        >
                          <img src={a.url} alt={a.filename} className="w-full h-56 object-cover" />
                          <div className="p-3">
                            <p className="text-xs font-semibold text-slate-800 truncate">{a.filename}</p>
                          </div>
                        </a>
                      ))}
                  </div>

                  <div className="space-y-2">
                    {(incident.attachments || []).map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-3">
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-sm text-sky-700 hover:underline truncate"
                        >
                          {a.filename}
                        </a>
                        <span className="text-xs text-slate-500 shrink-0">
                          {a.contentType || "file"} · {typeof a.sizeBytes === "number" ? `${a.sizeBytes} bytes` : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

