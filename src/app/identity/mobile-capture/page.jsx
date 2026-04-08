"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import {
  apiMobileCaptureSessionInfo,
  apiSubmitMobileCapture,
} from "@/lib/api";

export default function MobileCapturePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <p className="text-slate-600">Loading verification session…</p>
        </main>
      }
    >
      <MobileCapturePageInner />
    </Suspense>
  );
}

function MobileCapturePageInner() {
  const searchParams = useSearchParams();
  const token = useMemo(
    () => String(searchParams.get("token") || "").trim(),
    [searchParams]
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionInfo, setSessionInfo] = useState(null);
  const [cameraOpening, setCameraOpening] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [captureUrl, setCaptureUrl] = useState(null);
  const [captureFile, setCaptureFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [isMounted, setIsMounted] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    if (!cameraReady || !isMounted || !streamRef.current || !videoRef.current) return;
    let cancelled = false;
    const bindStream = async () => {
      if (cancelled || !videoRef.current || !streamRef.current) return;
      videoRef.current.srcObject = streamRef.current;
      try {
        await videoRef.current.play();
      } catch {
        // Ignore transient play timing failures on mobile; stream remains attached.
      }
    };
    bindStream();
    return () => {
      cancelled = true;
    };
  }, [cameraReady, isMounted]);

  useEffect(() => {
    async function loadSession() {
      if (!token) {
        setError("Missing verification token.");
        setLoading(false);
        return;
      }
      try {
        const info = await apiMobileCaptureSessionInfo(token);
        setSessionInfo(info);
      } catch (e) {
        setError(e?.message || "Invalid or expired verification link.");
      } finally {
        setLoading(false);
      }
    }
    loadSession();
  }, [token]);

  useEffect(() => {
    return () => {
      if (captureUrl) URL.revokeObjectURL(captureUrl);
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
      }
    };
  }, [captureUrl]);

  async function startCamera() {
    setError("");
    setCameraOpening(true);
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error("Camera is not supported in this browser.");
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        // Fallback for browsers that reject advanced constraints.
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      streamRef.current = stream;
      setCameraReady(true);
    } catch (e) {
      const msg = String(e?.message || "");
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied")) {
        setError("Camera permission denied. Please allow camera access in browser settings.");
      } else {
        setError("Could not open camera.");
      }
    } finally {
      setCameraOpening(false);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }

  async function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (
      !video ||
      !canvas ||
      video.readyState < 2 ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      setError("Camera is starting. Try capture again in 1-2 seconds.");
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (!blob) {
      setError("Failed to capture image.");
      return;
    }
    const file = new File([blob], `mobile-selfie-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
    if (captureUrl) URL.revokeObjectURL(captureUrl);
    setCaptureUrl(URL.createObjectURL(file));
    setCaptureFile(file);
    stopCamera();
  }

  async function submitCapture() {
    if (!captureFile || !token) return;
    setSubmitting(true);
    setError("");
    try {
      const out = await apiSubmitMobileCapture(token, captureFile);
      setResult(out);
    } catch (e) {
      setError(e?.message || "Failed to submit face capture.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600">Loading verification session…</p>
      </main>
    );
  }

  if (error && !sessionInfo) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <p className="text-red-700 text-center">{error}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-slate-100 p-4">
      <div className="max-w-md mx-auto rounded-3xl border border-white/10 bg-black/30 backdrop-blur p-5 shadow-2xl">
        <h1 className="text-xl font-bold">Verify your identity</h1>
        <p className="text-sm text-slate-300 mt-1">
          {sessionInfo?.userName ? `Hi ${sessionInfo.userName}, ` : ""}
          center your face in the oval, then take a clear selfie.
        </p>
        {sessionInfo?.expiresAt && (
          <p className="text-xs text-slate-400 mt-1">
            Link expires:{" "}
            {new Date(sessionInfo.expiresAt).toLocaleString()}
          </p>
        )}

        {/* Camera overlay is portaled to document.body to guarantee true fullscreen */}
        {cameraReady &&
          isMounted &&
          createPortal(
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: "100vw",
                height: "100dvh",
                zIndex: 9999,
                background: "#000",
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />

              <div
                style={{
                  pointerEvents: "none",
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: "72vw",
                    maxWidth: 360,
                    height: "84vw",
                    maxHeight: 420,
                    border: "3px solid rgba(255,255,255,0.95)",
                    borderRadius: "50% / 44%",
                    boxShadow:
                      "0 0 0 9999px rgba(0,0,0,0.35), 0 0 8px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.35)",
                  }}
                />
              </div>

              <div
                style={{
                  pointerEvents: "none",
                  position: "absolute",
                  top: "7%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  padding: "6px 16px",
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.55)",
                  fontSize: 13,
                  color: "#fff",
                  whiteSpace: "nowrap",
                }}
              >
                Keep your face inside the oval
              </div>

              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 24,
                  padding: "0 16px",
                }}
              >
                <div
                  style={{
                    maxWidth: 420,
                    margin: "0 auto",
                    borderRadius: 18,
                    background: "rgba(0,0,0,0.58)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    padding: "14px 16px",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    justifyContent: "center",
                  }}
                >
                  <button
                    type="button"
                    onClick={captureFrame}
                    style={{
                      padding: "11px 24px",
                      borderRadius: 12,
                      background: "#10b981",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 15,
                      border: "none",
                      cursor: "pointer",
                      boxShadow: "0 2px 12px rgba(16,185,129,0.4)",
                    }}
                  >
                    Capture photo
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    style={{
                      padding: "11px 24px",
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.15)",
                      color: "#f1f5f9",
                      fontWeight: 600,
                      fontSize: 15,
                      border: "1px solid rgba(255,255,255,0.2)",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* Hidden canvas for frame capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Captured photo preview */}
        {captureUrl && (
          <div className="mt-4">
            <p className="text-sm font-medium mb-2 text-slate-200">
              Captured photo
            </p>
            <img
              src={captureUrl}
              alt="Captured selfie"
              className="rounded-2xl border border-white/15 bg-black/20 w-full h-auto max-h-[26rem] object-contain"
            />
          </div>
        )}

        {/* Bottom action buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          {!cameraReady && (
            <button
              type="button"
              onClick={startCamera}
              disabled={cameraOpening || submitting}
              className="px-4 py-2 rounded-xl bg-[var(--primary)] text-white font-semibold disabled:opacity-40"
            >
              {cameraOpening ? "Opening camera..." : "Start camera"}
            </button>
          )}
          <button
            type="button"
            onClick={submitCapture}
            disabled={!captureFile || submitting}
            className="px-4 py-2 rounded-xl bg-slate-100 text-slate-900 font-semibold disabled:opacity-40"
          >
            {submitting ? "Submitting..." : "Submit verification"}
          </button>
        </div>

        {/* Error message */}
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

        {/* Verification result */}
        {result?.identityStatus && (
          <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-3">
            <p className="text-sm font-semibold">
              Result: {result.identityStatus}
            </p>
            {typeof result.identityScore === "number" && (
              <p className="text-xs text-slate-300 mt-1">
                Score: {result.identityScore.toFixed(3)}
              </p>
            )}
            {result.message && (
              <p className="text-xs text-slate-300 mt-1">{result.message}</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}