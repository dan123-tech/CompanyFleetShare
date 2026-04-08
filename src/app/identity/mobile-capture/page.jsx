"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
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
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraReady(true);
    } catch (e) {
      setError(e?.message || "Could not open camera.");
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

  // Oval dimensions in vmin units — responsive on all devices
  const ovalW = 62; // vmin (width)
  const ovalH = 78; // vmin (height)
  const ovalCY = 44; // % from top

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

        {/* ── CAMERA FULLSCREEN OVERLAY ── */}
        {cameraReady && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 120,
              background: "#000",
            }}
          >
            {/* Sharp video — fills entire screen */}
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

            {/*
              SVG overlay:
              - A <mask> cuts an oval hole so the blurred foreignObject
                does NOT cover the oval area → sharp video shows through
              - A glowing <ellipse> border draws the oval ring on top
            */}
            <svg
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                {/*
                  Mask:
                    white rect  → show blurred overlay
                    black ellipse → hide blurred overlay (reveal sharp video)
                */}
                <mask id="oval-mask">
                  <rect width="100%" height="100%" fill="white" />
                  <ellipse
                    cx="50%"
                    cy={`${ovalCY}%`}
                    rx={`${ovalW / 2}vmin`}
                    ry={`${ovalH / 2}vmin`}
                    fill="black"
                  />
                </mask>
              </defs>

              {/* Blurred + darkened overlay, with oval hole cut out */}
              <foreignObject
                width="100%"
                height="100%"
                mask="url(#oval-mask)"
              >
                <div
                  xmlns="http://www.w3.org/1999/xhtml"
                  style={{
                    width: "100%",
                    height: "100%",
                    backdropFilter: "blur(20px) brightness(0.4)",
                    WebkitBackdropFilter: "blur(20px) brightness(0.4)",
                  }}
                />
              </foreignObject>

              {/* Glowing oval border ring */}
              <ellipse
                cx="50%"
                cy={`${ovalCY}%`}
                rx={`${ovalW / 2}vmin`}
                ry={`${ovalH / 2}vmin`}
                fill="none"
                stroke="rgba(255,255,255,0.92)"
                strokeWidth="3"
                style={{
                  filter:
                    "drop-shadow(0 0 8px rgba(255,255,255,0.7)) drop-shadow(0 0 20px rgba(255,255,255,0.35))",
                }}
              />
            </svg>

            {/* Instruction label */}
            <div
              style={{
                pointerEvents: "none",
                position: "absolute",
                top: "6%",
                left: "50%",
                transform: "translateX(-50%)",
                padding: "6px 18px",
                borderRadius: 999,
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                fontSize: 13,
                color: "#fff",
                whiteSpace: "nowrap",
                zIndex: 10,
              }}
            >
              Keep your face inside the oval
            </div>

            {/* Action buttons */}
            <div
              style={{
                position: "absolute",
                bottom: 24,
                left: 0,
                right: 0,
                padding: "0 16px",
                zIndex: 10,
              }}
            >
              <div
                style={{
                  maxWidth: 420,
                  margin: "0 auto",
                  borderRadius: 18,
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
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
                  📸 Capture photo
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
          </div>
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