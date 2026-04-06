# Implementation log — licenta_dani-web

This document records **features and hardening** implemented in this repository (marketing site, installers, security). Use it for thesis appendices, handover notes, or pentest follow-up.

For deployment steps, see **`WEB_HOSTING_GUIDE.md`**. For SQLi/XSS/CORS basics, see **`SECURITY.md`**.

---

## 1. Marketing site and downloads (`/download`)

- **Company server (full Docker stack):** Download UX focuses on **orange-styled** cards and **direct download buttons** for bootstrap scripts; **Git clone URLs are not shown** in the UI for the company-server path.
- **Default clone target:** Installers clone **`https://github.com/dan123-tech/Licenta.git`** into a folder named **`Licenta`** (configurable via environment variables in the scripts).
- **AI driving-licence validator:** Separate download block with **buttons** for validator install scripts; placement and styling aligned with the company-server section.
- **Internationalisation:** Copy for the download experience is driven from **`src/i18n/messages/en.json`** and **`ro.json`**.

**Artifacts (served from `public/downloads/`):**

| File | Role |
|------|------|
| `fleetshare-full-server-install.sh` | Linux/macOS bootstrap |
| `fleetshare-full-server-install.ps1` | Windows PowerShell bootstrap |
| `fleetshare-full-server-commands.txt` | Human-readable instructions |
| `fleetshare-ai-validator-install.sh` / `.ps1` + commands | AI validator helpers |

---

## 2. Full-server bootstrap installers

Both scripts clone the **Licenta** repo, prepare `.env`, optionally patch **`docker-compose.yml`** host port mappings, then run the project’s **`install.sh`** / **`install.ps1`**.

### 2.1 Automatic environment variables

- **`NEXT_PUBLIC_APP_URL`**, **`NEXTAUTH_URL`**: Set from detected LAN IPv4 (or **`FLEETSHARE_PUBLIC_HOST`**) and chosen HTTP port; URLs are normalised (**no trailing slash**).
- **`AUTH_SECRET`**: Generated each run (**re-run logs everyone out** — documented in commands file).
- **`.env` hygiene:** Lines for those keys are removed whether **active or commented** (matches Licenta’s `.env.example` style).
- **Windows:** `.env` is written **UTF-8 without BOM** for reliable Docker Compose consumption.

### 2.2 Free host ports when 3000 / 3001 are busy

If **`FLEETSHARE_HTTP_PORT`** is **unset**, the installer scans **3000–3089** for the first free TCP port for the web app and prints a warning if not 3000.

If **`FLEETSHARE_LAN_PROXY_PORT`** is **unset**, it scans **3001–3099** for a free port **different from** the HTTP port.

If the user sets these variables explicitly, those values are used (no scan).

### 2.3 PowerShell robustness

- Avoid **`$HostIp`** (parsed as **`$Host` + `Ip`** in Windows PowerShell 5.1); use **`$PublicIp`** (or equivalent) for the detected address.

### 2.4 Public docs and privacy

- **`fleetshare-full-server-commands.txt`** uses a **placeholder hostname** in examples (not a real private IP) to reduce “private IP disclosure” noise in public scans.

---

## 3. Security hardening (production website)

### 3.1 HTTP security headers

Applied via **`next.config.mjs`** (`headers()`) and reinforced in **`src/middleware.js`** in production:

| Header | Purpose |
|--------|---------|
| `Referrer-Policy: strict-origin-when-cross-origin` | Limits referrer leakage |
| `X-Content-Type-Options: nosniff` | Reduces MIME sniffing |
| `X-Frame-Options: DENY` | Reduces clickjacking |
| `X-DNS-Prefetch-Control: off` | Disables DNS prefetch hint |
| `Permissions-Policy` | Disables camera/mic/geolocation by default |
| `Cross-Origin-Opener-Policy: same-origin` | Isolates browsing context |
| `Cross-Origin-Resource-Policy: same-origin` | Reduces cross-origin resource embedding |
| `Strict-Transport-Security` | HTTPS only (production; see middleware for `DISABLE_HSTS`) |
| `Content-Security-Policy` | Baseline CSP (includes `unsafe-inline` for Next.js compatibility) |

**Also:** `poweredByHeader: false` removes **`X-Powered-By: Next.js`**.

**Static / edge:** **`public/_headers`** mirrors some headers for hosts that honour that file.

### 3.2 `security.txt`

- **`public/.well-known/security.txt`** — security contact placeholder (`Contact:`). **Replace** with a monitored email before production disclosure expectations.

### 3.3 CSRF-style protection for state-changing auth APIs

**Hidden form tokens** are not used on JSON `fetch` login/register; instead, **`src/lib/security/csrf.js`** enforces **`Origin` / `Referer`** against the app origin and **`getCorsAllowedOrigins()`** (from **`NEXT_PUBLIC_APP_URL`** / **`CORS_ALLOWED_ORIGINS`**).

**Routes guarded:**

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/mfa-verify`
- `POST /api/auth/set-password`
- `PATCH /api/users/me/password`

Requests with a cross-site **`Origin`** that is not allow-listed receive **403**.

### 3.4 Auth forms (pages)

- **`/login`** and **`/register`** forms use **`method="post"`** so credentials are not submitted as a GET query string if JavaScript fails.

### 3.5 Cache control (sensitive pages)

- **`next.config.mjs`** sets **`Cache-Control: no-store, max-age=0`** for **`/`**, **`/login`**, **`/register`**, **`/privacy`**.
- Middleware adds **`no-store`** for non-API **GET/HEAD** in production (static `_next` assets keep normal long cache elsewhere — intentional for performance).

### 3.6 Reverse proxy (local / self-hosted Docker)

- **`deploy/Caddyfile`**: strips **`Server`** and **`X-Powered-By`** on the Caddy path to reduce passive fingerprinting.

### 3.7 CORS (unchanged behaviour, documented)

- **`src/middleware.js`** + **`src/lib/security/cors.js`**: allow-listed origins only; credentials require explicit origin echo.

---

## 4. What automated scanners often still report

These are often **informational** or **platform defaults**, not missing app patches:

- **“Modern web application”** / **user-agent fuzzing** — generic fingerprints.
- **Cached `_next/static/*`** — expected; hashed assets are safe to cache aggressively.
- **TLS / certificate chain** on **custom or LAN** endpoints — fix at DNS + CA (Let’s Encrypt, Cloudflare Full Strict), not only in this repo.
- **403 to bots** — WAF or bot protection can block scanner probes; verify headers with a normal browser or `curl` from an allowed client.

After code changes, **redeploy** production before re-running external scans.

---

## 5. Related source files (quick index)

| Area | Files |
|------|--------|
| Next headers / build | `next.config.mjs` |
| Middleware, CORS, prod headers | `src/middleware.js` |
| CSRF helper | `src/lib/security/csrf.js` |
| CORS list | `src/lib/security/cors.js` |
| Auth routes | `src/app/api/auth/*/route.js`, `src/app/api/users/me/password/route.js` |
| Login / register UI | `src/app/login/page.jsx`, `src/app/register/page.jsx` |
| Download UI | `src/app/download/DownloadPageClient.jsx` |
| Installers | `public/downloads/fleetshare-full-server-install.*`, `fleetshare-full-server-commands.txt` |
| Caddy TLS path | `deploy/Caddyfile`, `docker-compose.yml` |
| Security disclosure | `public/.well-known/security.txt`, `public/_headers` |

---

*Last updated to reflect repository state at implementation time; adjust dates and contact fields for your thesis or production runbook.*
