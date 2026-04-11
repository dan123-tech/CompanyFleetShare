# FleetShare — Company Car Sharing (Web Edition)

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-336791?style=for-the-badge&logo=postgresql)
![Vercel](https://img.shields.io/badge/Vercel-Deployment-000000?style=for-the-badge&logo=vercel)
![Cloudflare](https://img.shields.io/badge/Cloudflare-AI_Backend-F38020?style=for-the-badge&logo=cloudflare)

PostgreSQL-first Next.js app for company fleet booking, licence validation, and admin management.

## Tech Architecture

| Layer | Platform |
|---|---|
| Web app + API routes | Next.js (App Router) |
| Auth/session | Cookie-based auth |
| Database | PostgreSQL via Prisma (control-plane + per-company tenant DB) |
| Recommended production hosting | Vercel + Neon |
| AI backend (driving licence / identity) | `ai-driving-licence-llm-cloudflare` |

## What’s Included

- User and admin dashboards
- Driving licence upload and AI validation flow
- Identity anti-impersonation flow (live scan + face match)
- Reservation lifecycle (create, release, history, approvals)
- Maintenance log + ITP expiry tracking + analytics exports
- Incident reporting (users can submit reports with photos/documents; admins can review)
- i18n (EN/RO), mobile-friendly UI, API docs endpoint

## Quick Start (Local)

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```

Local URLs:
- App: `http://localhost:3100`
- API docs: `http://localhost:3100/api-docs`

## Security

This section is the **operator-facing summary** for what ships in this repo. Implementation details live under `src/middleware.js` and `src/lib/security/`.

### Secrets and environment variables

- **Never put secrets in `NEXT_PUBLIC_*` variables.** They are exposed in client bundles. Use server-only variables for `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, API keys, and webhook-style tokens.
- **Rotate `AUTH_SECRET`** if it may have leaked (e.g. committed, pasted in chat). Generate a new value (for example `openssl rand -base64 32`), update the env var everywhere, redeploy, and expect users to sign in again.
- **Rotate database credentials** after incidents or team changes; update `DATABASE_URL` / `DIRECT_URL` in each environment.
- **Least privilege:** where your host allows, use a migration-capable DB role only in CI / `prisma migrate`, and a narrower runtime user for the app.

### Authentication hardening

| Control | Behaviour |
| --- | --- |
| **Auth rate limits** | `POST /api/auth/login` (failed attempts), `POST /api/auth/register`, `POST /api/auth/mfa-verify` (failed codes). Prefer Cloudflare **KV** binding `RATE_LIMIT_KV` on Workers; otherwise counters use the control-plane `AuthRateLimit` table (run migrations). Tune with `AUTH_RATE_LIMIT_*` in `.env.example`; set `AUTH_RATE_LIMIT_ENABLED=0` to disable. |
| **Account lockout** | After repeated failed passwords (defaults in `.env.example`: `LOGIN_LOCKOUT_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES`), sign-in is blocked temporarily. Uses `User.loginFailedAttempts` / `User.loginLockedUntil` on the control DB. |
| **Dashboard idle sign-out** | Inactivity on `/dashboard` triggers logout (`NEXT_PUBLIC_WEB_IDLE_LOGOUT_MINUTES`, default 30). |

### API and request integrity

- **Broad API rate limit:** middleware applies a per-IP fixed window on `/api/*` (except `OPTIONS`), default **120 req/min** in production (`API_RATE_LIMIT_PER_MINUTE`, `API_RATE_LIMIT_ENABLED`). Counts are **per serverless isolate**; pair with a CDN/WAF or shared store if you need strict global caps.
- **CSRF / origin checks:** cookie-authenticated `POST` / `PATCH` / `DELETE` routes use trusted-origin checks (`requireTrustedOriginForMutation` / `assertTrustedRequestOrigin` in `src/lib/security/`). Cron-style routes use bearer secrets instead.

### HTTP headers and browser policy

- **CSP**, **X-Frame-Options**, **X-Content-Type-Options**, **Referrer-Policy**, **Permissions-Policy**, and related headers are set in **`src/middleware.js`** for matched routes. **HSTS** is applied for HTTPS requests unless `DISABLE_HSTS` is set (useful for local HTTP testing).
- **`next.config.mjs`** may set overlapping baseline headers; middleware CSP is authoritative for app routes where configured.
- **CSP violation reports:** when reporting is enabled in middleware, browsers may `POST` JSON to `/api/csp-report` (see `src/middleware.js` and `src/app/api/csp-report/route.js`).

### Supply chain and dependencies

- **Dependabot** is configured in `.github/dependabot.yml` (grouped npm updates).
- **CI:** `.github/workflows/security-audit.yml` runs `npm audit --audit-level=critical`. Treat critical findings before merging.

### Reporting issues

If you discover a vulnerability in this project, open a **private** advisory or contact the maintainers through the channels you use for production support. Do not post exploit details in public issues before a fix is available.

## Documentation

Extended runbooks, thesis drafts, and local credential notes are **not tracked** in this repository (see `.gitignore`). Keep private copies on your machine if you use them. This README plus `src/lib/security/` and `.env.example` are the canonical in-repo references for security-related configuration.

## Required Environment Variables

Core:
- `DATABASE_URL`
- `DIRECT_URL`
- `AUTH_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `NEXTAUTH_URL`

AI backend (recommended on Vercel):
- `AI_DRIVING_LICENCE_LLM_CLOUDFLARE_URL=https://<your-cloudflare-ai-backend>`
- `AI_FACE_RECOGNITION_URL=https://ai-face-recognition-nine.vercel.app`
- `AI_FACE_RECOGNITION_VERIFY_PATH=/verify`

Legacy/local fallback (kept for Docker/dev compatibility):
- `AI_VERIFICATION_URL=http://localhost:8080`
- `AI_VERIFY_PATH=/validate`
- `AI_VERIFY_FORM_FIELD=file` (optional)

Identity face-match tuning:
- `AI_FACE_MATCH_PATH=/face-match` (optional)
- `AI_FACE_MATCH_THRESHOLD=0.35` (optional)
- `AI_FACE_MATCH_TIMEOUT_MS=30000` (optional)

Booking enforcement toggle:
- `ENFORCE_IDENTITY_VERIFICATION=true`

Tenant provisioning (Neon, database-per-company):
- `NEON_API_KEY`
- `NEON_PROJECT_ID`
- `NEON_ROLE_NAME`
- `NEON_ROOT_BRANCH_ID` (optional, default `br-main`)

## Deployment (Recommended)

### Vercel + Neon + Cloudflare domain

1. Create Neon database and copy pooled/direct URLs.
2. Import repo in Vercel.
3. Set env vars in Vercel (including `AI_DRIVING_LICENCE_LLM_CLOUDFLARE_URL`).
4. Point your domain from Cloudflare DNS to Vercel.
5. Redeploy after env changes.

For Vercel + Neon + Cloudflare DNS, follow your provider dashboards; optional detailed notes can live in a local `docs/` folder (not in this repo).

## Identity Verification Flow

The current anti-impersonation implementation includes:
- licence image upload (`/api/users/me/driving-licence`)
- live camera scan capture in dashboard
- AI face match (`/api/users/me/identity/verify`)
- admin approve/reject controls in user management
- optional reservation block until verified (`ENFORCE_IDENTITY_VERIFICATION=true`)

## Multi-Tenant Databases

- Each company is provisioned with a dedicated Neon database/branch.
- Shared control-plane DB stores auth/session + company-to-tenant mapping.
- Company-scoped operations resolve `companyId` to tenant connection and execute on that tenant DB.

## Related Repository

The full thesis/server edition (orchestrator + extended integrations) is available at:
- [dan123-tech/Licenta](https://github.com/dan123-tech/Licenta)
