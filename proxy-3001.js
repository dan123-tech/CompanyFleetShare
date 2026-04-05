/**
 * Lightweight HTTP + WebSocket proxy.
 * Listens on 0.0.0.0:3101 by default (override with env PROXY_PORT, e.g. 3010) and forwards to
 * localhost:TARGET_PORT (default 3100) so another app can use 3000/3001.
 *
 * This allows the app to be reached at both:
 *   • http://localhost:3100        (direct)
 *   • http://<network-ip>:3101    (via this proxy, from phones / other devices)
 *   • http://localhost:3101        (also works locally)
 *
 * Uses only Node.js built-in modules — no extra npm packages needed.
 * Handles WebSocket upgrades so Next.js HMR (hot reload) keeps working.
 */

const http = require("http");
const net = require("net");

const TARGET_HOST = "127.0.0.1";
const TARGET_PORT = Number(process.env.TARGET_PORT) || 3100;
const PROXY_PORT = Number(process.env.PROXY_PORT) || 3101;

/** Hop-by-hop headers: do not forward (RFC 9110). */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "proxy-connection",
]);

/**
 * Copy upstream headers to the client response. Set-Cookie must be appended per cookie;
 * passing the raw headers object to writeHead() can merge/join cookies incorrectly and
 * break login (session never sticks when using http://<LAN-IP>:3101).
 */
function forwardResponseHeaders(upstreamRes, clientRes) {
  const h = upstreamRes.headers;
  const setCookie = h["set-cookie"];

  for (const key of Object.keys(h)) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    if (key.toLowerCase() === "set-cookie") continue;
    const val = h[key];
    if (val === undefined) continue;
    if (Array.isArray(val)) {
      for (const v of val) clientRes.appendHeader(key, v);
    } else {
      clientRes.setHeader(key, val);
    }
  }

  if (setCookie) {
    if (Array.isArray(setCookie)) {
      for (const c of setCookie) clientRes.appendHeader("Set-Cookie", c);
    } else {
      clientRes.setHeader("Set-Cookie", setCookie);
    }
  }
}

// ── HTTP request proxy ────────────────────────────────────────────────────────

function proxyRequest(req, res) {
  const options = {
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${TARGET_HOST}:${TARGET_PORT}`,
    },
  };

  const upstream = http.request(options, (upstreamRes) => {
    res.statusCode = upstreamRes.statusCode;
    forwardResponseHeaders(upstreamRes, res);
    upstreamRes.pipe(res, { end: true });
  });

  upstream.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain" });
    }
    res.end(`Proxy error: ${err.message}`);
  });

  req.pipe(upstream, { end: true });
}

// ── WebSocket (HMR / upgrade) proxy ──────────────────────────────────────────

function proxyUpgrade(req, clientSocket, head) {
  const targetSocket = net.connect(TARGET_PORT, TARGET_HOST, () => {
    // Re-send the upgrade handshake to the upstream server
    const headerLines = [
      `${req.method} ${req.url} HTTP/${req.httpVersion}`,
      ...Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`),
      "",
      "",
    ];
    targetSocket.write(headerLines.join("\r\n"));
    if (head && head.length) targetSocket.write(head);

    clientSocket.pipe(targetSocket);
    targetSocket.pipe(clientSocket);
  });

  targetSocket.on("error", () => { try { clientSocket.destroy(); } catch (_) {} });
  clientSocket.on("error", () => { try { targetSocket.destroy(); } catch (_) {} });
}

// ── Start server ──────────────────────────────────────────────────────────────

const server = http.createServer(proxyRequest);
server.on("upgrade", proxyUpgrade);

server.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(
    `[proxy-3001] Forwarding  :${PROXY_PORT}  →  localhost:${TARGET_PORT}`
  );
  console.log(`[proxy-3001] App reachable at:`);
  console.log(`  • http://localhost:${PROXY_PORT}`);
  console.log(`  • http://<your-network-ip>:${PROXY_PORT}`);
});

server.on("error", (err) => {
  console.error(`[proxy-3001] Error: ${err.message}`);
  process.exit(1);
});
