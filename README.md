# Company Car Sharing — Web edition

Next.js + **PostgreSQL only** (Prisma). Intended for **Vercel** + a hosted database (Neon, Supabase, Vercel Postgres, etc.).

This repo **does not** ship Database Settings or external data sources (no Microsoft Entra / SSO integration for user directories, no SQL Server / Firebase / SharePoint as app data layers).

The **full thesis / server edition** (orchestrator + SSO-capable layers, Docker-focused) is the sibling project **`licenta_dani-main`** — keep that as your main Git repo; use **this** folder as a **separate Git repository** for the public web demo.

## New Git remote (you run once)

```bash
cd path/to/licenta_dani-web
git init
git add -A
git commit --trailer "Made-with: Cursor" -m "Initial commit: web edition (PostgreSQL only)"
git branch -M main
git remote add origin https://github.com/YOUR_USER/licenta-dani-web.git
git push -u origin main
```

## Environment

```bash
cp .env.example .env
```

Set **`DATABASE_URL`** and **`DIRECT_URL`** (same value for local Postgres; on [Neon](https://neon.tech) use pooled + direct strings from the dashboard), **`AUTH_SECRET`** (32+ chars), **`NEXT_PUBLIC_APP_URL`**, and **`NEXTAUTH_URL`** (production URL). See `.env.example` and `docs/DATABASE.md`.

### Neon extension (Cursor / VS Code)

This repo includes **`.vscode/extensions.json`** (recommends [Neon - Serverless Postgres](https://marketplace.visualstudio.com/items?itemName=databricks.neon-local-connect)) and **`.vscode/settings.json`** (`neon.mcpServer.autoConfigEnabled`).

1. Install the extension when prompted, or from Extensions: **Neon - Serverless Postgres**.
2. **Neon: Sign In** in the Command Palette (`Ctrl+Shift+P`), then connect your org → project → branch.
3. Run **Neon: Get Started** (also in the Command Palette) so Neon can align tooling with the workspace.
4. Paste into **`.env`** (not committed): **`DATABASE_URL`** = Neon **pooled** string, **`DIRECT_URL`** = **direct** string (from Neon dashboard **Connect → Prisma**, or the extension). This app’s Prisma schema requires **both**; if you only see one connection string, add the direct URL manually.

Reload the window if the Neon MCP status in the sidebar looks stuck.

## Vercel + Neon (recommended hosting)

Stack: **Next.js on Vercel** and **PostgreSQL on [Neon](https://neon.tech)**. The build runs migrations then compiles the app (`vercel.json`).

### 1. Neon database

1. Sign up at [neon.tech](https://neon.tech) and create a project (default database name, e.g. `neondb`, is fine).
2. In the Neon dashboard: **Connect** → choose **Prisma**.
3. Copy **two** connection strings:
   - **Pooled** → will be `DATABASE_URL` on Vercel.
   - **Direct** → will be `DIRECT_URL` on Vercel (used by `prisma migrate deploy` during build).
4. Ensure each URL includes your Prisma schema, e.g. `?schema=public` or `&schema=public` if query params already exist.

Optional: In the Vercel dashboard you can add Neon via **Storage** / integrations; if that only creates `DATABASE_URL`, still add **`DIRECT_URL`** manually from Neon (same place as step 3).

### 2. Vercel project

1. Push this repo to GitHub and in [Vercel](https://vercel.com) choose **Add New… → Project** and import the repository.
2. **Settings → Environment Variables** — add at least:

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Neon **pooled** connection string |
| `DIRECT_URL` | Neon **direct** connection string |
| `AUTH_SECRET` | Random string, 32+ characters (e.g. `openssl rand -base64 32`) |
| `NEXT_PUBLIC_APP_URL` | Your live URL, e.g. `https://your-app.vercel.app` (no trailing slash) |
| `NEXTAUTH_URL` | Same as public URL in production (used for OpenAPI base URL, etc.) |

Use **Production** (and **Preview** if you want preview deployments to hit the same database; otherwise point Preview at a separate Neon branch).

3. Deploy. The build runs `prisma migrate deploy` then `npm run build`; it needs **`DIRECT_URL`** and **`DATABASE_URL`** available during that step.

**If the build fails with `P1012` / `Environment variable not found: DATABASE_URL`:** the Vercel build has no database URL. Open **Project → Settings → Environment Variables**, add **`DATABASE_URL`** and **`DIRECT_URL`**, and ensure **Production** is checked for each (Preview/Development only is *not* enough for a production deploy). Save, then **Deployments → … → Redeploy** (or push an empty commit). Variables are not applied retroactively to past builds until you redeploy.

**If login succeeds but you are sent back to `/login` (or the dashboard never loads):** the session cookie may not be sticking. Check **one canonical host** (either always `www.` or always apex — not mixed). Set **`NEXT_PUBLIC_APP_URL`** and **`NEXTAUTH_URL`** to that exact URL. In the browser **Network** tab, open the **`/api/auth/login`** response and confirm **`Set-Cookie`** is present. Ensure **`AUTH_SECRET`** is set on Vercel (32+ characters) and redeploy after changing it. The app assumes HTTPS on Vercel in production for cookie flags; if you still see issues, try from another browser or disable strict extensions temporarily.

### 3. After first deploy

- Open the deployed URL and register / log in as needed.
- Optional: **Domains** in Vercel for a custom hostname; update `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` to match.

More detail: `docs/DATABASE.md` (Neon section) and `.env.example`.

### Cloudflare + Vercel + Neon

If your **domain** is on **Cloudflare** but you want the **Next.js app (pages + `/api`)** on **Vercel** and **Postgres** on **Neon**: put Cloudflare in front (DNS / optional proxy) and point records at Vercel’s origin. You still deploy **one** app on Vercel; Cloudflare does not host the Node server for this repo.

See **`docs/DEPLOY_CLOUDFLARE_VERCEL_NEON.md`** (Option A = recommended; Option B = OpenNext on Workers only, no Vercel).

## Local dev

Next.js listens on **3100** (and the LAN proxy on **3101**) so another project can keep **3000/3001**. `npm run dev` runs `npx next dev -H 0.0.0.0 -p 3100` plus the proxy.

```bash
npm install
npx prisma migrate dev
npm run dev
```

Set `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to `http://localhost:3100` in `.env` if you use them locally.

API docs: http://localhost:3100/api-docs

## More documentation

See the `docs/` folder (copied from the main project). Ignore SQL Server / multi–data-source sections for this edition.
