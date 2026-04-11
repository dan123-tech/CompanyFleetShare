# Security notes

**Web security hardening (idle logout, account lockout, API IP limits, CSP/HSTS in middleware):** see the dedicated operator guide [WEB-SECURITY-UPDATE.md](./WEB-SECURITY-UPDATE.md).

## Secrets and environment variables

- **Never put secrets in `NEXT_PUBLIC_*` variables.** Those values are embedded in client bundles. Use server-only env vars (no `NEXT_PUBLIC_` prefix) for database URLs, `AUTH_SECRET`, API keys, and tokens.
- **Rotate `AUTH_SECRET`** on a schedule or immediately after any suspicion of exposure. Generate a new value (for example `openssl rand -base64 32`), update the env var, redeploy, and invalidate existing sessions (users sign in again).
- **Rotate database passwords** after leaks or team changes. Update the provider (Neon, RDS, etc.), then `DATABASE_URL` / `DIRECT_URL` in all environments.
- **Least privilege:** where your host allows it, use a migration role only in CI/`prisma migrate` and a more restricted DB user for the app runtime.

## Auth rate limiting (login, register, MFA)

- Implemented on:
  - `POST /api/auth/login` (failed credentials only)
  - `POST /api/auth/register`
  - `POST /api/auth/mfa-verify` (failed codes)
- **Cloudflare Workers:** bind a KV namespace as `RATE_LIMIT_KV` on the Worker (Wrangler / Workers & Pages → Settings → Bindings). Counters are stored in KV first.
- **Vercel / Node (no KV bindings):** limits fall back to the control-plane table `AuthRateLimit` (**run migrations** so the table exists).
- Tune with optional env vars (see `.env.example`): window length, per-IP and per-email caps, `AUTH_RATE_LIMIT_ENABLED=0` to disable.

## Account lockout (failed passwords)

- After **5** failed password attempts for the same user (configurable), the account is blocked from signing in for **15** minutes (`LOGIN_LOCKOUT_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES`). Fields: `User.loginLockedUntil`, `User.loginFailedAttempts` (control DB — run Prisma migrate).
- Every failed attempt is logged as a single JSON line to stderr (`event: login_failure`, includes normalized email, `userId` when known, client IP, reason).
- Successful password verification clears the failure counter (before MFA if applicable).

## API rate limit (per IP)

- `src/middleware.js` applies a fixed-window cap on **all** `/api/*` routes (except `OPTIONS`), default **120/min/IP** in production (`API_RATE_LIMIT_PER_MINUTE`, `API_RATE_LIMIT_ENABLED`). Counters are **in-memory per isolate**; for strict global limits on serverless, add a CDN/WAF or Redis-backed limiter.

## Web session idle sign-out

- On `/dashboard`, **30 minutes** without pointer/keyboard/scroll activity triggers client logout (`NEXT_PUBLIC_WEB_IDLE_LOGOUT_MINUTES`). Users are redirected to `/login?reason=idle`.

## CSRF / origin checks

Cookie-authenticated `POST` / `PATCH` / `DELETE` API routes use `requireTrustedOriginForMutation` (same rules as `assertTrustedRequestOrigin`: allowed `Origin` / `Referer` or missing both for non-browser clients). Cron routes use bearer secrets instead and are unchanged.

## Content-Security-Policy and HTTP headers

- **CSP**, **X-Frame-Options**, **X-Content-Type-Options**, **Referrer-Policy**, **Permissions-Policy**, **COOP/CORP** are applied in `src/middleware.js` for matched routes (development and production). **HSTS** is set in middleware when the request URL is HTTPS and `DISABLE_HSTS` is not set.
- `next.config.mjs` still sets overlapping baseline headers for static responses; CSP is authoritative from middleware for app routes. Scripts use `'unsafe-inline'` where required by Next.js; glovebox document API routes use `frame-ancestors 'self'`.

## Supply chain

- Dependabot is configured under `.github/dependabot.yml`.
- Dependabot npm updates are grouped to reduce noise (at most one open PR at a time).
- CI runs `npm audit --audit-level=critical` (`.github/workflows/security-audit.yml`). Address or document any critical findings before merging.
