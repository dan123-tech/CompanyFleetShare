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

---

## 4. Identity verification (anti-impersonation)

- Added a second verification factor for users: **selfie + face match** against uploaded driving licence.
- Added `User` identity fields and enum in Prisma:
  - `selfieUrl`
  - `identityStatus` (`UNVERIFIED`, `PENDING`, `VERIFIED`, `REJECTED`, `PENDING_REVIEW`)
  - `identityVerifiedAt`, `identityVerifiedBy`, `identityScore`, `identityReason`
- Added secure selfie storage/serving modules:
  - `src/lib/selfie-storage.js`
  - `src/lib/selfie-ref.js`
  - `src/lib/selfie-serve.js`
- Added new APIs:
  - `POST/DELETE /api/users/me/selfie`
  - `POST /api/users/me/identity/verify`
  - `GET /api/users/[id]/selfie/image`
- Added AI client for face matching:
  - `src/lib/identity-verification.js`
  - Uses `AI_FACE_MATCH_URL`, `AI_FACE_MATCH_PATH`, `AI_FACE_MATCH_THRESHOLD`, `AI_FACE_MATCH_TIMEOUT_MS`
- Added booking gate (feature-flagged):
  - If `ENFORCE_IDENTITY_VERIFICATION=true`, reservation create requires `identityStatus === VERIFIED`.
- Added user dashboard identity UI:
  - selfie upload/delete
  - verify identity action
  - identity status badges and notices
- Added admin review controls in user management:
  - manual approve/reject for identity status.

### 4.1 Vercel backend switch to Cloudflare AI service

- Updated AI backend resolution so Vercel can use a Cloudflare-hosted validator service directly.
- New preferred env:
  - `AI_DRIVING_LICENCE_LLM_CLOUDFLARE_URL`
- Backward-compatible fallbacks remain:
  - `AI_VERIFICATION_URL`
  - local fallback `http://localhost:8080`
- Applied to:
  - `src/lib/ai-verification.js` (driving licence validation)
  - `src/lib/identity-verification.js` (face match for identity verification)
- Updated `.env.example` with deployment guidance for Vercel + Cloudflare AI backend.


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

## 5. Maintenance log, calendar feed, and booking emails

### 5.1 Maintenance history (`MaintenanceEvent`)

- **Model:** `MaintenanceEvent` — `companyId`, `carId`, `performedAt`, optional `mileageKm`, `serviceType`, `cost`, `notes`.
- **API:** `GET/POST /api/maintenance`, `DELETE /api/maintenance/[id]` (admin).
- **UI:** Admin sidebar → **Maintenance log** — add records and list/delete.

### 5.2 ICS subscription feed (all reservations for a user)

- **Secret URL:** `GET /api/calendar/feed?token=…` — token is **per-user** (`User.calendarFeedToken`).
- **Endpoints:** `GET/POST/DELETE /api/users/me/calendar-feed` — show URL, rotate token, disable feed.
- **UI:** Dashboard → **Security** — booking emails toggle + calendar subscription controls.

### 5.3 Email notifications (beyond MFA)

- **Preference:** `User.emailBookingNotifications` (default **true**). When **off**, the app skips non-MFA transactional emails for **booking** events (confirmation was already implemented; extended here).
- **Emails:** confirmation (existing), **cancel**, **extend**, **km-exceeded decision** (approve/reject).
- **Requires:** `RESEND_API_KEY` and `EMAIL_FROM` (same as other emails).

---

## 6. Maintenance statistics + maintenance seed automation

### 6.1 Admin maintenance statistics UI

- **Page:** Admin dashboard → **Maintenance log**.
- **Computed aggregates (`useMemo`) over maintenance events:**
  - total maintenance records;
  - total cost and average cost (for rows that include cost);
  - records and cost in the last 12 months;
  - ratio of records with cost values;
  - top vehicles by number of service entries (with per-vehicle accumulated cost);
  - last 6 calendar months grouped counts (visual bar chart).
- **Display rule:** stats block is shown when maintenance data is loaded and there is at least one record.
- **Formatting:** cost values use locale/currency formatting from i18n (`formatCurrency`).

### 6.2 i18n for maintenance statistics

- Added `maintenanceStats.*` translation keys in:
  - `src/i18n/messages/en.json`
  - `src/i18n/messages/ro.json`
- This avoids rendering raw translation keys in the Maintenance log statistics area.

### 6.3 Database seed for maintenance logs (all cars)

- Added **idempotent** seed script: `scripts/seed-maintenance-all-cars.js`.
- Behavior:
  - scans cars (all companies, or one company when `COMPANY_ID` is set);
  - inserts sample maintenance rows only for cars with **no** maintenance history yet;
  - updates `Car.lastServiceMileage` and `Car.lastServiceYearMonth` from the latest seeded service event.
- Added npm command: **`npm run seed:maintenance`**.
- Main demo seed (`scripts/seed-users-and-cars.js`) now calls the maintenance seed helper so demo cars get maintenance history automatically.

### 6.4 Script/runtime compatibility for Prisma client engine

- Added `scripts/prisma-for-scripts.js` as a shared helper for Node scripts.
- Reason: schema uses `engineType = "client"`; script-side Prisma needs a driver adapter setup (Neon + `ws`) aligned with app runtime expectations.

### 6.5 Brand assets update

- Updated SVG brand assets in `public/brand/`:
  - `fleetshare-logo-dark.svg`
  - `fleetshare-logo-light.svg`
  - `fleetshare-mark-dark.svg`
  - `fleetshare-mark-light.svg`

---

## 7. Related source files (quick index)

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
| Maintenance + calendar + booking prefs | `src/lib/maintenance.js`, `src/app/api/maintenance/**`, `src/app/api/calendar/feed/route.js`, `src/app/api/users/me/notifications/route.js`, `src/app/api/users/me/calendar-feed/route.js`, `src/lib/email.js` |
| Maintenance statistics UI | `src/components/dashboard/AdminDashboard.jsx`, `src/i18n/messages/en.json`, `src/i18n/messages/ro.json` |
| Maintenance seeding scripts | `scripts/seed-maintenance-all-cars.js`, `scripts/seed-users-and-cars.js`, `scripts/prisma-for-scripts.js`, `package.json` |
| Brand SVG updates | `public/brand/fleetshare-logo-*.svg`, `public/brand/fleetshare-mark-*.svg` |

---

*Last updated to reflect repository state at implementation time; adjust dates and contact fields for your thesis or production runbook.*
