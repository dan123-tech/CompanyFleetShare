# Web hosting guide — FleetShare (licenta_dani-web)

This document explains **how to put the app on the web** (recommended: **Vercel** + **Neon Postgres**) and points to **security** and **production** behaviour (CORS, XSS, SQLi, optional obfuscation).

---

## 1. Prerequisites

- A **GitHub** account and this repository pushed to GitHub (see [§5 Push to Git](#5-push-to-git)).
- A **PostgreSQL** database reachable from the internet (**Neon** is recommended; free tier is enough for demos).

---

## 2. Put the app on the web (Vercel + Neon)

### Step A — Create the database (Neon)

1. Go to [neon.tech](https://neon.tech) and create a project.
2. **Dashboard → Connect → Prisma** (or equivalent).
3. Copy **two** connection strings:
   - **Pooled** → will be `DATABASE_URL`.
   - **Direct** → will be `DIRECT_URL` (required so `prisma migrate deploy` works during the Vercel build).
4. Ensure URLs include `?schema=public` or `&schema=public` if your Prisma schema uses `public`.

### Step B — Create the Vercel project

1. Open [vercel.com](https://vercel.com) → **Add New… → Project** → import **this GitHub repo**.
2. Vercel detects Next.js. The repo’s `vercel.json` runs **`prisma migrate deploy`** then **`npm run build`** on each production build.
3. **Project → Settings → Environment Variables** — add the variables from the table below for **Production** (and Preview if you use preview deployments).

### Step C — Deploy

- **Automatic:** Every `git push` to the connected branch (e.g. `main`) triggers a new deployment.
- **Manual:** **Deployments → … → Redeploy** on the latest deployment.

Wait until the build shows **Ready**, then open the **Production URL** (or your custom domain).

### Step D — Custom domain (optional)

1. **Vercel → Project → Settings → Domains** — add `www.yourdomain.com` (and/or apex).
2. Follow Vercel’s DNS instructions (at your registrar or **Cloudflare**).
3. Update environment variables **`NEXT_PUBLIC_APP_URL`** and **`NEXTAUTH_URL`** to match the **canonical** URL you use in the browser (choose **either** `www` **or** apex consistently).

---

## 3. Environment variables checklist (production)

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | **Yes** | Neon **pooled** Postgres URL |
| `DIRECT_URL` | **Yes** | Neon **direct** URL (migrations at build time) |
| `AUTH_SECRET` | **Yes** | Session signing; **≥ 32 characters** (e.g. `openssl rand -base64 32`) |
| `NEXT_PUBLIC_APP_URL` | **Yes** | Public site URL, no trailing slash, e.g. `https://www.companyfleetshare.com` |
| `NEXTAUTH_URL` | **Yes** | Same as public URL in production |
| `RESEND_API_KEY` | For email | Transactional email (welcome, invites, MFA codes, admin-created user) |
| `EMAIL_FROM` | For email | Verified sender, e.g. `no-reply@yourdomain.com` |
| `EMAIL_FROM_NAME` | Optional | Display name for emails |
| `EMAIL_LOGO_URL` | Optional | PNG logo URL for email (some clients block SVG; default uses `/brand/fleetshare-logo-dark.svg` on your site) |
| `EMAIL_PUBLIC_SITE_URL` | Optional | Same role as `NEXT_PUBLIC_APP_URL` for email links if the latter is unset |
| `BLOB_READ_WRITE_TOKEN` | On Vercel | Driving licence file uploads (Vercel Blob); link store in **Vercel → Storage → Blob** |
| `BLOB_PUT_ACCESS` | Optional | `private` (default) or `public` — must match Blob **store** type |
| `CORS_ALLOWED_ORIGINS` | Optional | Comma-separated origins allowed to call `/api/*` with cookies (mobile / multiple front-end hosts). If unset, `NEXT_PUBLIC_APP_URL` is used as a single allowed origin when set |
| `DISABLE_WEB_OBFUSCATION` | Optional | Set to `1` to skip client JS obfuscation during `next build` (debug only) |
| `DISABLE_HSTS` | Optional | Set to `1` to omit HSTS (e.g. local HTTPS experiments) |

Copy from **`.env.example`** and never commit real `.env` files.

**Cloudflare Workers (OpenNext):** If you deploy with `npm run deploy` / Wrangler instead of Vercel, set the **same** secrets on the Worker (including `BLOB_READ_WRITE_TOKEN`); Vercel-only env vars are **not** visible to Workers.

---

## 4. Security documentation (SQLi, XSS, CORS)

Detailed notes live in **`docs/SECURITY.md`**:

| Topic | Summary |
|--------|---------|
| **SQL injection** | Prisma uses parameterized queries. Optional SQL Server connector uses `mssql` `.input()` parameters. |
| **XSS** | React escapes text by default; AI chat markdown is HTML-escaped and link URLs are restricted (`http`, `https`, same-site paths, `mailto`). |
| **CORS** | Middleware adds allow-listed origins for `/api/*` when `CORS_ALLOWED_ORIGINS` or `NEXT_PUBLIC_APP_URL` is set; `OPTIONS` preflight is handled. |

Production security headers (`X-Frame-Options`, `X-Content-Type-Options`, etc.) are set in **`src/middleware.js`**.

**Client obfuscation:** Production browser bundles can use **identifier obfuscation** via `webpack-obfuscator` in **`next.config.mjs`** (conservative settings). This is **not** a substitute for server-side secrets; never put secrets in `NEXT_PUBLIC_*`.

---

## 5. Push to Git

From your project folder (replace the remote URL with yours if different):

```bash
git status
git add -A
git commit -m "Describe your changes"
git push origin main
```

First-time setup (if the remote is missing):

```bash
git remote add origin https://github.com/YOUR_USER/licenta_dani-web.git
git branch -M main
git push -u origin main
```

After pushing, Vercel (if connected to the repo) builds and deploys automatically.

---

## 6. Troubleshooting (quick)

| Symptom | What to check |
|---------|----------------|
| Build fails: missing `DATABASE_URL` | Variables exist for **Production**; **Redeploy** after saving |
| Login then bounce to `/login` | `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `NEXTAUTH_URL`, single canonical host (www vs apex) |
| Driving licence upload fails | `BLOB_READ_WRITE_TOKEN`, Blob store linked, `BLOB_PUT_ACCESS` matches store type |
| No emails | `RESEND_API_KEY`, `EMAIL_FROM`, domain verified in Resend |
| API from another origin blocked | `CORS_ALLOWED_ORIGINS` includes that exact `Origin` (scheme + host, no trailing slash) |

More database detail: **`docs/DATABASE.md`**. Cloudflare DNS + Vercel: **`docs/DEPLOY_CLOUDFLARE_VERCEL_NEON.md`**.
