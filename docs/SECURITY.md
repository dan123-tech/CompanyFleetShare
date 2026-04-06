# Security notes (FleetShare web)

For **deploying to the web**, environment variables, and Git workflow, see **`WEB_HOSTING_GUIDE.md`**.

## SQL injection (SQLi)

- **PostgreSQL (default):** The app uses **Prisma**. Queries are **parameterized**; user input is not concatenated into SQL strings for the main data layer.
- **SQL Server (optional connector):** Updates use **`mssql` `.input()` parameters** (`@Name`, `@Email`, …). Dynamic parts are fixed column names in code, not user-controlled SQL fragments. Table names come from **admin configuration**; treat that config as trusted (only admins can change it).

Do not replace Prisma or parameterized `mssql` calls with string-built SQL using end-user input.

## Cross-site scripting (XSS)

- **React** escapes text in JSX by default.
- Places that render **HTML strings** (e.g. AI chat markdown) use **HTML escaping** and **safe link URL checks** before rendering.
- **Content Security Policy** is enabled with a baseline policy in production (see `next.config.mjs` and `src/middleware.js`). `script-src` / `style-src` include `'unsafe-inline'` where required for Next.js; primary XSS defense remains React escaping and safe rendering for rich content.

## CSRF (API)

- JSON login/register and related auth endpoints validate **`Origin` / `Referer`** against the deployed origin (and `CORS_ALLOWED_ORIGINS` / `NEXT_PUBLIC_APP_URL`). See `src/lib/security/csrf.js` and **`IMPLEMENTATION_LOG.md` §3.3**.

## CORS

- By default, browser calls from **the same site** as the app do not need CORS.
- For **other origins** (mobile app, another hostname, local dev), set:
  - **`CORS_ALLOWED_ORIGINS`** — comma-separated list, e.g. `https://www.companyfleetshare.com,https://companyfleetshare.com`
  - Or rely on **`NEXT_PUBLIC_APP_URL`** as a **single** allowed origin when `CORS_ALLOWED_ORIGINS` is unset.

Credentials (`cookies`) require an explicit origin (not `*`). Preflight `OPTIONS` is handled in middleware for `/api/*`.

## Related headers (middleware + Next config)

Production responses set CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, cross-origin policies, and HSTS when appropriate. See `src/middleware.js`, `next.config.mjs`, and **`IMPLEMENTATION_LOG.md`** for the full list.
