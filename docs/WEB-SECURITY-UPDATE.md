# Web security hardening — operator guide

This document describes the **web security hardening** release: inactivity sign-out, account lockout after failed logins, per-IP API rate limiting, and unified HTTP security headers (including Content-Security-Policy in middleware).

For general security practices (secrets, CSRF, supply chain), see [SECURITY.md](./SECURITY.md).

---

## Deployment checklist

1. **Run database migrations** on the **control** database (same `DATABASE_URL` as the app):

   ```bash
   npx prisma migrate deploy
   ```

   This applies **`20260412120000_user_login_lockout`**, which adds:

   - `User.loginLockedUntil` (timestamp, nullable)
   - `User.loginFailedAttempts` (integer, default `0`)

2. **Redeploy** the Next.js app so `src/middleware.js` and new libraries are active.

3. **Optional:** set or review environment variables (see [Environment variables](#environment-variables)).

4. **Optional:** configure log aggregation to capture **stderr** lines containing `"login_failure"` for monitoring and incident response.

---

## 1. Inactivity auto sign-out (web dashboard)

### Behaviour

- While the user is on **`/dashboard`**, the app tracks **pointer, keyboard, scroll, and touch** activity.
- If there is **no qualifying activity** for **30 minutes** (default), the client:
  - calls **`POST /api/auth/logout`** (best effort),
  - clears the tab web session id in `sessionStorage`,
  - dispatches the existing **`WEB_SESSION_LOST_EVENT`** (same mechanism as session revocation elsewhere),
  - redirects to **`/login?reason=idle`**.
- The login page shows a short notice when `reason=idle` is present.

### Implementation

| Item | Location |
|------|----------|
| Idle timer and listeners | `src/components/dashboard/WebIdleLogout.jsx` |
| Mounted on dashboard | `src/app/dashboard/page.jsx` (next to `WebSessionLiveGuard`) |

### Configuration

| Variable | Scope | Default | Notes |
|----------|--------|---------|--------|
| `NEXT_PUBLIC_WEB_IDLE_LOGOUT_MINUTES` | Client (build time) | `30` | Must be available at **build** if you change it (Next.js inlines `NEXT_PUBLIC_*`). |

---

## 2. Brute-force protection (account lockout + logging)

### Behaviour

- Applies to **`POST /api/auth/login`** when the email matches an existing user and the **password is wrong**.
- After **5** consecutive failed password attempts for that user (default), the account cannot sign in until **`loginLockedUntil`** has passed (**15 minutes** after lock, default).
- While locked, login returns **HTTP 429** with a **`Retry-After`** header (seconds until unlock) and a clear message (distinct from generic “invalid credentials”).
- **Unknown email** + wrong password still returns **401** (“invalid credentials”) and does **not** increment per-user lock state (there is no user row yet).
- **Successful password** clears `loginFailedAttempts` and `loginLockedUntil` before MFA or session issuance.
- **Every** failed login attempt worth logging emits a **single JSON line** to the server logger (`console.warn`), for example:

  ```json
  {"event":"login_failure","ts":"2026-04-12T12:00:00.000Z","reason":"invalid_password","emailNorm":"user@example.com","userId":"clxxx...","ip":"203.0.113.1","attempt":3,"maxAttempts":5}
  ```

  Reasons include: `invalid_credentials_unknown_user`, `invalid_password`, `account_locked`, `login_blocked_account_locked`.

### Implementation

| Item | Location |
|------|----------|
| Lockout logic + logging helpers | `src/lib/security/login-lockout.js` |
| Login route integration | `src/app/api/auth/login/route.js` |
| Prisma schema | `prisma/schema.prisma` → `User.loginLockedUntil`, `User.loginFailedAttempts` |
| SQL migration | `prisma/migrations/20260412120000_user_login_lockout/migration.sql` |

### Configuration

| Variable | Default | Notes |
|----------|---------|--------|
| `LOGIN_LOCKOUT_MAX_ATTEMPTS` | `5` | Failed password attempts before lock. |
| `LOGIN_LOCKOUT_MINUTES` | `15` | Lock duration after threshold is reached. |

Existing **auth rate limits** (IP/email buckets for login/register/MFA) remain documented in [SECURITY.md](./SECURITY.md) and `.env.example` (`AUTH_RATE_*`).

---

## 3. Per-IP API rate limiting (all `/api/*` routes)

### Behaviour

- **`src/middleware.js`** runs **before** the request hits route handlers.
- For **`/api/*`** (all methods except **`OPTIONS`**), a **fixed 1-minute window** per client IP increments a counter.
- If the count exceeds the configured maximum, the middleware responds with **429** JSON `{ "error": "Too many requests. Please try again later." }` and **`Retry-After`** (seconds until the next window).
- **CORS** responses for allowed origins are preserved on 429 where applicable.

### Limitations (important for production)

- Counters are stored **in memory inside the Node/Edge isolate**. On **serverless** (e.g. Vercel), each instance/region has its own memory: limits are **best-effort**, not a strict global cap per IP.
- For strict, global limits, use your **CDN/WAF**, **API gateway**, or a **shared store** (e.g. Redis / Upstash) in addition to this layer.

### Implementation

| Item | Location |
|------|----------|
| Fixed-window limiter | `src/lib/security/middleware-ip-rate-limit.js` |
| Wiring | `src/middleware.js` |

### Configuration

| Variable | Default | Notes |
|----------|---------|--------|
| `API_RATE_LIMIT_ENABLED` | `1` in **production**, off in **dev** unless set | Set to `0` or `false` to disable. |
| `API_RATE_LIMIT_PER_MINUTE` | `120` | Max requests per IP per rolling minute window. |

---

## 4. Security HTTP headers (CSP, framing, HSTS, etc.)

### Behaviour

- For all routes matched by **`src/middleware.js`** (see `config.matcher`), the response includes:
  - **Content-Security-Policy** (or **Content-Security-Policy-Report-Only** if `CSP_REPORT_ONLY=1`)
  - **X-Content-Type-Options: nosniff**
  - **X-Frame-Options** (`DENY` by default; **`SAMEORIGIN`** for glovebox/vignette document API paths so same-origin iframes work)
  - **Referrer-Policy**, **Permissions-Policy**, **Cross-Origin-Opener-Policy**, **Cross-Origin-Resource-Policy**
  - **Strict-Transport-Security** when the request URL is **HTTPS** and **`DISABLE_HSTS`** is not set
- Applies in **development and production** (so local HTTPS and staging behave like prod regarding CSP framing rules).
- **`next.config.mjs`** still sets a baseline set of headers for static routing; **HSTS** was removed from `next.config.mjs` to avoid duplicating **Strict-Transport-Security** with middleware.

### CSP reporting

| Variable | Purpose |
|----------|---------|
| `CSP_REPORT_ONLY` | Set to `1` to send **Content-Security-Policy-Report-Only** instead of enforcing CSP. |
| `CSP_REPORT_URI` | Defaults to `/api/csp-report`. |

---

## Environment variables (quick reference)

Copy descriptions from **`.env.example`** in the repository root. Summary:

| Area | Variables |
|------|-----------|
| Idle logout | `NEXT_PUBLIC_WEB_IDLE_LOGOUT_MINUTES` |
| Account lockout | `LOGIN_LOCKOUT_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES` |
| API IP limit | `API_RATE_LIMIT_ENABLED`, `API_RATE_LIMIT_PER_MINUTE` |
| CSP / HSTS | `CSP_REPORT_ONLY`, `CSP_REPORT_URI`, `DISABLE_HSTS` |
| Auth buckets (existing) | `AUTH_RATE_LIMIT_*`, `RATE_LIMIT_KV` (Workers) |

---

## Testing locally

1. **Idle sign-out:** open `/dashboard`, wait without touching the app (or temporarily set a low `NEXT_PUBLIC_WEB_IDLE_LOGOUT_MINUTES` and rebuild), confirm redirect to `/login?reason=idle`.
2. **Lockout:** use a test user, submit wrong password **5** times, then expect **429** on further attempts until ~15 minutes (or lower `LOGIN_LOCKOUT_MINUTES` for a quicker test).
3. **API rate limit:** set `API_RATE_LIMIT_ENABLED=1` and a low `API_RATE_LIMIT_PER_MINUTE`, then hammer any `/api/...` endpoint from one IP and expect **429**.
4. **Headers:** open DevTools → Network → pick any document or API response → verify **Content-Security-Policy** and **X-Frame-Options** (and **Strict-Transport-Security** on HTTPS).

---

## Related documentation

- [SECURITY.md](./SECURITY.md) — secrets, auth rate limits, CSRF, supply chain, overview of these features.
- [.env.example](../.env.example) — commented env templates.
