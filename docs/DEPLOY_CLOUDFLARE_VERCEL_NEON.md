# Cloudflare + Vercel + Neon

This app is **one Next.js project**: pages and **`/api/*` routes** ship together. You do **not** run “only the UI” on Cloudflare and “only the API” on Vercel without splitting the repo or adding a second API service.

Pick **one** of the layouts below.

---

## Option A (recommended): Cloudflare in front, app on Vercel, DB on Neon

**What runs where**

- **[Neon](https://neon.tech)** — PostgreSQL (`DATABASE_URL` pooled, `DIRECT_URL` direct).
- **[Vercel](https://vercel.com)** — full Next.js (UI + API + `prisma migrate deploy` on build). See root `vercel.json`.
- **[Cloudflare](https://dash.cloudflare.com)** — DNS (and optional proxy / CDN / WAF) for your **custom domain** pointing at Vercel.

Traffic: `Browser → Cloudflare → Vercel → Neon` (only DNS/proxy at Cloudflare; the Node/Edge runtime is still Vercel).

### 1. Neon

Same as README: create project, set **pooled** → `DATABASE_URL`, **direct** → `DIRECT_URL` (with `schema=public`). Apply migrations (Vercel build runs `prisma migrate deploy`).

### 2. Vercel

1. Import the Git repo, add env vars: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `NEXTAUTH_URL`.
2. Deploy and note the **`.vercel.app`** URL (or attach a domain in Vercel first).

### 3. Cloudflare (custom domain)

1. Add the domain to Cloudflare (change nameservers at your registrar if needed).
2. In **Vercel** → Project → **Domains**: add `www.yourdomain.com` and/or `yourdomain.com`. Vercel shows the DNS records to create (often a **CNAME** to `cname.vercel-dns.com` or similar).
3. In **Cloudflare** → **DNS**, create those records:
   - For **www**: type **CNAME**, name `www`, target exactly what Vercel shows, **Proxy status** Proxied (orange cloud) or DNS-only depending on your preference (Proxied is usual).
   - For **apex** (`yourdomain.com`): follow Vercel’s instructions (CNAME flattening / ALIAS, or the A records they specify).
4. **SSL/TLS** in Cloudflare: use **Full (strict)** so the browser ↔ Cloudflare and Cloudflare ↔ Vercel paths are both HTTPS.
5. Set **`NEXT_PUBLIC_APP_URL`** and **`NEXTAUTH_URL`** on Vercel to your **public** URL (`https://www.yourdomain.com` or `https://yourdomain.com`, no trailing slash) and redeploy.

Optional: disable or tune Cloudflare features that break cookies or long requests (e.g. aggressive Bot Fight for your API paths) if you see odd login or upload failures.

---

## Option B: Full app on Cloudflare Workers (OpenNext), DB on Neon — no Vercel

The repo includes **`@opennextjs/cloudflare`** and scripts `build:cf`, `deploy`, `preview`. That path runs **UI and API on Cloudflare**, not on Vercel.

- Set Neon secrets in **Wrangler** / Workers dashboard (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, etc.).
- Builds may use `WORKERS_CI=1` so `npm run build` runs OpenNext (see `scripts/run-build.js`).
- Prisma on Workers often needs the **Neon serverless driver** / adapter; validate against [Prisma + Neon serverless docs](https://neon.tech/docs/guides/prisma) before relying on production traffic.

Use **either** Vercel **or** OpenNext on Cloudflare for this monolith—not both—unless you maintain two deployment pipelines for the same code intentionally.

---

## Summary

| Goal | Use |
|------|-----|
| “Domain / CDN on Cloudflare, backend + frontend logic on Vercel, Postgres on Neon” | **Option A** |
| “Everything on Cloudflare edge/Workers, Postgres on Neon” | **Option B** |
| “UI on Cloudflare, same Next `/api` on Vercel” | Not supported without **splitting** the project into a separate API (extra work) |

For your stated stack (**Cloudflare + Vercel + Neon**), implement **Option A**.
