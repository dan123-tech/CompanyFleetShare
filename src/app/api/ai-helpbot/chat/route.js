/**
 * AI Help-Bot Proxy Route
 *
 * Proxies chat requests from the frontend to the Help-Bot Docker service.
 * This runs server-side (Next.js), so it can use Docker DNS names
 * (e.g., http://helpbot:8501) for inter-container communication.
 *
 * In development (no Docker), it falls back to http://localhost:8501.
 *
 * Supports dev_mode toggle: when false, tells the bot to give
 * explanations only (no code). When true, includes code snippets.
 */

import { getSession } from "@/lib/auth";
import { errorResponse, requireTrustedOriginForMutation } from "@/lib/api-helpers";

const HELPBOT_URL = process.env.HELPBOT_URL || "http://localhost:8501";

export async function POST(request) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  const session = await getSession();
  if (!session) return errorResponse("Unauthorized", 401);

  try {
    const body = await request.json();
    const { message, session_id, dev_mode } = body;

    if (!message || !message.trim()) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    // Build the message with mode prefix for the bot
    let finalMessage = message.trim();
    if (dev_mode) {
      finalMessage = `[DEVELOPER MODE] ${finalMessage}`;
    } else {
      finalMessage = `[USER MODE - Respond with clear explanations only. Do NOT include any code blocks, code snippets, file paths, technical commands, or terminal commands. Explain everything in simple, plain language that a non-technical person can understand. Use bullet points and numbered steps for clarity.] ${finalMessage}`;
    }

    const response = await fetch(`${HELPBOT_URL}/api/chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: finalMessage,
        session_id: session_id || "web_default",
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return Response.json(
        {
          error: errorData.detail || `Help-Bot returned ${response.status}`,
          bot_status: "error",
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json({
      response: data.response,
      session_id: data.session_id,
      bot_status: "ok",
    });
  } catch (error) {
    console.error("[AI Help-Bot Proxy] Error:", error.message);

    if (
      error.message.includes("fetch failed") ||
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("connect")
    ) {
      return Response.json(
        {
          error:
            "Help-Bot service is not reachable. Make sure it is running on port 8501.",
          bot_status: "offline",
        },
        { status: 503 }
      );
    }

    if (error.name === "TimeoutError") {
      return Response.json(
        {
          error: "Help-Bot took too long to respond. Please try again.",
          bot_status: "timeout",
        },
        { status: 504 }
      );
    }

    return Response.json(
      { error: error.message, bot_status: "error" },
      { status: 500 }
    );
  }
}

/**
 * Health check - verify the Help-Bot is reachable (logged-in users only)
 */
export async function GET() {
  const session = await getSession();
  if (!session) return errorResponse("Unauthorized", 401);

  try {
    const response = await fetch(`${HELPBOT_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    return Response.json({ ...data, bot_url: HELPBOT_URL });
  } catch (error) {
    return Response.json(
      {
        status: "offline",
        error: `Cannot reach Help-Bot at ${HELPBOT_URL}`,
        bot_url: HELPBOT_URL,
      },
      { status: 503 }
    );
  }
}
