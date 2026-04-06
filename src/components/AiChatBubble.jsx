"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { escapeHtml, isSafeChatHref } from "@/lib/security/escape-html";

/**
 * Floating AI Help-Bot chat widget.
 *
 * Two modes:
 *   - User Mode (default): explanations only, no code blocks
 *   - Developer Mode (toggle): includes code snippets, file paths, commands
 */
export default function AiChatBubble() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [botStatus, setBotStatus] = useState("checking");
  const [sessionId] = useState(() => `web_${Date.now()}`);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { credentials: "include" });
        if (!cancelled) setAuthenticated(res.ok);
      } catch {
        if (!cancelled) setAuthenticated(false);
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!authenticated) setOpen(false);
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    setMessages((prev) => {
      if (prev.length > 0) return prev;
      return [{ role: "ai", text: t("aiChat.welcome") }];
    });
  }, [t, authenticated]);

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  useEffect(() => {
    if (open && botStatus === "checking") {
      checkBotHealth();
    }
  }, [open, botStatus]);

  async function checkBotHealth() {
    try {
      const res = await fetch("/api/ai-helpbot/chat", { method: "GET" });
      const data = await res.json();
      setBotStatus(data.status === "healthy" ? "online" : "offline");
    } catch {
      setBotStatus("offline");
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai-helpbot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          session_id: sessionId,
          dev_mode: devMode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            text: `**${t("aiChat.errorPrefix")}** ${data.error || t("aiChat.errorGeneric")}`,
            isError: true,
          },
        ]);
        if (data.bot_status === "offline") setBotStatus("offline");
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: data.response, devMode },
        ]);
        setBotStatus("online");
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: t("aiChat.connectionError"),
          isError: true,
        },
      ]);
      setBotStatus("offline");
    } finally {
      setIsLoading(false);
    }
  }

  function clearChat() {
    setMessages([{ role: "ai", text: t("aiChat.cleared") }]);
  }

  /**
   * Render AI text with markdown support.
   * In user mode: strips code blocks, shows only plain text formatting.
   * In dev mode: full markdown with code blocks, inline code, etc.
   */
  function renderMessage(text, msgDevMode) {
    if (!text) return null;

    // Determine if this particular message should show code
    const showCode = msgDevMode === true;

    // Split by code blocks
    const parts = text.split(/(```[\s\S]*?```)/g);

    return parts.map((part, i) => {
      // Code block
      if (part.startsWith("```") && part.endsWith("```")) {
        if (!showCode) {
          // In user mode: skip code blocks entirely
          return null;
        }
        const inner = part.slice(3, -3);
        const lines = inner.split("\n");
        const firstLine = lines[0].trim();
        const isLangTag = firstLine && !firstLine.includes(" ") && firstLine.length < 20;
        const code = isLangTag ? lines.slice(1).join("\n") : inner;
        return (
          <pre
            key={i}
            className="my-2 p-3 rounded-lg bg-slate-900 text-green-300 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all"
          >
            {code.trim()}
          </pre>
        );
      }

      // Text lines
      return (
        <span key={i}>
          {part.split("\n").map((line, j, arr) => {
            // Escape first so raw HTML/scripts from the model cannot become XSS; then limited markdown → HTML.
            const safeLine = escapeHtml(line);
            let processed = safeLine.replace(
              /\*\*(.+?)\*\*/g,
              '<strong class="font-semibold">$1</strong>'
            );

            if (showCode) {
              processed = processed.replace(
                /`([^`]+)`/g,
                '<code class="px-1.5 py-0.5 bg-slate-200/80 text-violet-700 rounded text-xs font-mono">$1</code>'
              );
            } else {
              processed = processed.replace(/`([^`]+)`/g, "$1");
            }

            processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
              if (!isSafeChatHref(url)) {
                return label;
              }
              const hrefEsc = escapeHtml(url.trim());
              return `<a href="${hrefEsc}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">${label}</a>`;
            });

            // Bullet lists
            const isBullet = /^(\s*[-*]\s)/.test(line);
            if (isBullet) {
              processed = processed.replace(/^(\s*)[-*]\s/, "");
              return (
                <span key={j}>
                  <span className="flex gap-1.5 ml-1">
                    <span className="text-violet-400 flex-shrink-0">&#x2022;</span>
                    <span dangerouslySetInnerHTML={{ __html: processed }} />
                  </span>
                </span>
              );
            }

            // Numbered lists
            const numMatch = line.match(/^(\d+)\.\s/);
            if (numMatch) {
              processed = processed.replace(/^\d+\.\s/, "");
              return (
                <span key={j}>
                  <span className="flex gap-1.5 ml-1">
                    <span className="text-violet-400 flex-shrink-0 text-xs font-bold">{numMatch[1]}.</span>
                    <span dangerouslySetInnerHTML={{ __html: processed }} />
                  </span>
                </span>
              );
            }

            // Headers
            if (line.startsWith("### ")) {
              return (
                <span key={j} className="block font-bold text-sm mt-2 mb-0.5 text-slate-800">
                  {line.replace("### ", "")}
                  {j < arr.length - 1 && <br />}
                </span>
              );
            }
            if (line.startsWith("## ")) {
              return (
                <span key={j} className="block font-bold text-sm mt-2 mb-0.5 text-slate-800">
                  {line.replace("## ", "")}
                  {j < arr.length - 1 && <br />}
                </span>
              );
            }

            return (
              <span key={j}>
                <span dangerouslySetInnerHTML={{ __html: processed }} />
                {j < arr.length - 1 && <br />}
              </span>
            );
          })}
        </span>
      );
    });
  }

  // Status dot
  const statusColor =
    botStatus === "online"
      ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]"
      : botStatus === "offline"
      ? "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.7)]"
      : "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)] animate-pulse";

  const statusText =
    botStatus === "online"
      ? t("aiChat.statusOnline")
      : botStatus === "offline"
        ? t("aiChat.statusOffline")
        : t("aiChat.statusConnecting");

  if (!authChecked || !authenticated) return null;

  return (
    <>
      <style>{`
        @keyframes ai-ping {
          0% { transform: scale(1); opacity: 0.6; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes ai-slide-in {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ai-dots {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* Floating button */}
      <div className="fixed bottom-6 right-6 z-50">
        {!open && (
          <span
            className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 opacity-60"
            style={{ animation: "ai-ping 2s cubic-bezier(0,0,0.2,1) infinite" }}
          />
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={t("aiChat.toggleAria")}
          className={`relative w-14 h-14 rounded-2xl text-white shadow-lg flex items-center justify-center transition-all duration-300 ${
            open
              ? "bg-slate-700 hover:bg-slate-800 rotate-0"
              : "bg-gradient-to-br from-violet-600 to-blue-500 hover:from-violet-700 hover:to-blue-600 hover:shadow-xl hover:scale-105"
          } active:scale-95`}
        >
          {open ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <rect x="4" y="8" width="16" height="12" rx="3" />
              <circle cx="9" cy="14" r="1.5" fill="currentColor" />
              <circle cx="15" cy="14" r="1.5" fill="currentColor" />
              <path strokeLinecap="round" d="M12 4v4" />
              <circle cx="12" cy="3" r="1.5" />
              <path strokeLinecap="round" d="M1 14h3M20 14h3" />
            </svg>
          )}
        </button>
      </div>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 w-[360px] sm:w-[420px] max-h-[75vh] bg-white rounded-2xl shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden"
          style={{ animation: "ai-slide-in 0.2s ease-out" }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-violet-700 via-blue-600 to-blue-500 px-5 py-3.5 flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                <rect x="4" y="8" width="16" height="12" rx="3" />
                <circle cx="9" cy="14" r="1.5" fill="currentColor" />
                <circle cx="15" cy="14" r="1.5" fill="currentColor" />
                <path strokeLinecap="round" d="M12 4v4" />
                <circle cx="12" cy="3" r="1.5" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold text-sm">{t("aiChat.title")}</h3>
              <p className="text-blue-100/70 text-xs">{t("aiChat.poweredBy")}</p>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Developer mode toggle */}
              <button
                onClick={() => setDevMode((v) => !v)}
                title={devMode ? t("aiChat.devModeOnTitle") : t("aiChat.devModeOffTitle")}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all duration-200 ${
                  devMode
                    ? "bg-amber-400/30 text-amber-200 hover:bg-amber-400/40"
                    : "bg-white/10 text-white/50 hover:bg-white/20 hover:text-white/70"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                DEV
                {/* Toggle pill */}
                <span className={`relative w-6 h-3.5 rounded-full transition-colors duration-200 ${devMode ? "bg-amber-400" : "bg-white/30"}`}>
                  <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform duration-200 ${devMode ? "translate-x-3" : "translate-x-0.5"}`} />
                </span>
              </button>
              {/* Clear chat button */}
              <button
                onClick={clearChat}
                title={t("aiChat.clearChatTitle")}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              {/* Status dot */}
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusColor}`} title={statusText} />
            </div>
          </div>

          {/* Dev mode banner */}
          {devMode && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center gap-2 text-xs text-amber-700">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <span className="font-medium">{t("aiChat.devBannerTitle")}</span>
              <span className="text-amber-500">{t("aiChat.devBannerHint")}</span>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-[240px] max-h-[55vh] bg-slate-50/50">
            {messages.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">{t("common.loading")}</p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "ai" && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <rect x="4" y="8" width="16" height="12" rx="3" />
                      <circle cx="9" cy="14" r="1.5" fill="currentColor" />
                      <circle cx="15" cy="14" r="1.5" fill="currentColor" />
                    </svg>
                  </div>
                )}
                <div
                  className={`max-w-[82%] px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-violet-600 to-blue-500 text-white rounded-2xl rounded-br-md shadow-sm"
                      : msg.isError
                      ? "bg-red-50 text-red-700 rounded-2xl rounded-bl-md shadow-sm border border-red-200"
                      : "bg-white text-slate-700 rounded-2xl rounded-bl-md shadow-sm border border-slate-100"
                  }`}
                >
                  {msg.role === "ai" ? renderMessage(msg.text, msg.devMode) : msg.text}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <rect x="4" y="8" width="16" height="12" rx="3" />
                    <circle cx="9" cy="14" r="1.5" fill="currentColor" />
                    <circle cx="15" cy="14" r="1.5" fill="currentColor" />
                  </svg>
                </div>
                <div className="bg-white text-slate-400 rounded-2xl rounded-bl-md shadow-sm border border-slate-100 px-4 py-3 flex gap-1.5 items-center">
                  <span className="w-2 h-2 bg-slate-400 rounded-full" style={{ animation: "ai-dots 1.4s infinite 0s" }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full" style={{ animation: "ai-dots 1.4s infinite 0.2s" }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full" style={{ animation: "ai-dots 1.4s infinite 0.4s" }} />
                  <span className="text-xs ml-1.5">{t("aiChat.thinking")}</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Offline banner */}
          {botStatus === "offline" && (
            <div className="bg-amber-50 border-t border-amber-200 px-4 py-2 flex items-center gap-2 text-xs text-amber-700">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{t("aiChat.offlineBanner")}</span>
              <button onClick={checkBotHealth} className="underline font-medium hover:text-amber-900">{t("aiChat.retry")}</button>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSend} className="border-t border-slate-200 bg-white px-4 py-3 flex gap-2 flex-shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isLoading ? t("aiChat.placeholderLoading") : t("aiChat.placeholderAsk")}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-500 hover:from-violet-700 hover:to-blue-600 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <svg className="w-5 h-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              )}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
