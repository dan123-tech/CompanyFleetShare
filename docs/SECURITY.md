# Security notes

## Secrets and environment variables

- **Never put secrets in `NEXT_PUBLIC_*` variables.** Those values are embedded in client bundles. Use server-only env vars (no `NEXT_PUBLIC_` prefix) for database URLs, `AUTH_SECRET`, API keys, and tokens.
- **Rotate `AUTH_SECRET`** on a schedule or immediately after any suspicion of exposure. Generate a new value (for example `openssl rand -base64 32`), update the env var, redeploy, and invalidate existing sessions (users sign in again).
- **Rotate database passwords** after leaks or team changes. Update the provider (Neon, RDS, etc.), then `DATABASE_URL` / `DIRECT_URL` in all environments.
- **Least privilege:** where your host allows it, use a migration role only in CI/`prisma migrate` and a more restricted DB user for the app runtime.

## Auth rate limiting (login, register, MFA)

- **Cloudflare Workers:** bind a KV namespace as `RATE_LIMIT_KV` on the Worker (Wrangler / Workers & Pages → Settings → Bindings). Counters are stored in KV first.
- **Without KV** (e.g. plain Node or Vercel without Worker bindings), limits use the control-plane table `AuthRateLimit` after you run migrations.
- Tune with optional env vars (see `.env.example`): window length, per-IP and per-email caps, `AUTH_RATE_LIMIT_ENABLED=0` to disable.

## CSRF / origin checks

Cookie-authenticated `POST` / `PATCH` / `DELETE` API routes use `requireTrustedOriginForMutation` (same rules as `assertTrustedRequestOrigin`: allowed `Origin` / `Referer` or missing both for non-browser clients). Cron routes use bearer secrets instead and are unchanged.

## Content-Security-Policy

Production CSP is set in `next.config.mjs` and `middleware.js`. Scripts still use `'unsafe-inline'` where required by Next.js; over time you can move toward nonces or hashes. Glovebox document responses keep `frame-ancestors 'self'`.

## Supply chain

- Dependabot is configured under `.github/dependabot.yml`.
- CI runs `npm audit --audit-level=critical` (`.github/workflows/security-audit.yml`). Address or document any critical findings before merging.
